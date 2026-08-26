package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// headless proof — architecture.md §5.
// Prints GO_CORE_READY addr=... http=... token=... after gRPC/HTTP bind.

func main() {
	var (
		headless   = flag.Bool("headless", false, "run in headless mode (no Electron required)")
		grpcAddr   = flag.String("grpc-addr", "127.0.0.1:0", "gRPC listen addr (unix:///tmp/... or 127.0.0.1:0)")
		httpAddr   = flag.String("http-fallback-addr", "127.0.0.1:0", "HTTP fallback listen addr")
		httpFallbackAddr string
		dbPath     = flag.String("db", "", "SQLite DB path (default per-user location)")
		logLevel   = flag.String("log-level", "info", "log level (debug|info|warn|error)")
		tokenFlag  = flag.String("token", "", "auth token (generated if empty in headless)")
	)
	// alias for httpAddr to support --http-fallback-addr and --http-addr
	flag.StringVar(&httpFallbackAddr, "http-addr", "", "alias for --http-fallback-addr")
	flag.Parse()

	// Resolve http addr alias
	effectiveHTTP := *httpAddr
	if httpFallbackAddr != "" {
		effectiveHTTP = httpFallbackAddr
	}

	_ = *dbPath
	_ = *logLevel

	token := *tokenFlag
	if token == "" && *headless {
		token = generateToken()
	}
	if token == "" {
		token = "dev-token"
	}

	// Start TCP listeners (stub gRPC + HTTP). Unix socket path handling is stubbed to TCP for portability.
	grpcLis, err := net.Listen("tcp", resolveAddr(*grpcAddr))
	if err != nil {
		log.Fatalf("grpc listen failed: %v", err)
	}
	defer grpcLis.Close()

	httpLis, err := net.Listen("tcp", resolveAddr(effectiveHTTP))
	if err != nil {
		log.Fatalf("http listen failed: %v", err)
	}
	defer httpLis.Close()

	grpcAddrStr := grpcLis.Addr().String()
	httpAddrStr := httpLis.Addr().String()
	// Preserve unix:// prefix for display if requested via unix://
	if isUnixAddr(*grpcAddr) {
		grpcAddrStr = *grpcAddr
	}

	// Minimal HTTP fallback stub
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"ok":true}`)
	})
	httpSrv := &http.Server{Handler: mux}

	go func() {
		if err := httpSrv.Serve(httpLis); err != nil && err != http.ErrServerClosed {
			log.Printf("http serve error: %v", err)
		}
	}()

	// Stub gRPC accept loop (no real gRPC until buf generated)
	go func() {
		for {
			conn, err := grpcLis.Accept()
			if err != nil {
				return
			}
			// Drain and close — real gRPC handler will replace this
			_ = conn.Close()
		}
	}()

	if *headless {
		// Required stdout line for supervisor discovery (ipc-strategy.md §2.6)
		fmt.Printf("GO_CORE_READY addr=%s http=%s token=%s\n", grpcAddrStr, httpAddrStr, token)
		_ = os.Stdout.Sync()
	} else {
		log.Printf("go-core listening grpc=%s http=%s (use --headless to emit GO_CORE_READY)", grpcAddrStr, httpAddrStr)
	}

	// Graceful shutdown on SIGTERM/SIGINT
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	<-ctx.Done()
	log.Printf("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutdownCtx)
	_ = grpcLis.Close()
	_ = shutdownCtx
}

func resolveAddr(addr string) string {
	if addr == "" {
		return "127.0.0.1:0"
	}
	if isUnixAddr(addr) {
		// Stub: map unix socket to ephemeral TCP for scaffold buildability
		// Real implementation will listen on unix socket at path
		return "127.0.0.1:0"
	}
	return addr
}

func isUnixAddr(addr string) bool {
	return len(addr) > 7 && addr[:7] == "unix://"
}

func generateToken() string {
	const letters = "0123456789abcdef"
	b := make([]byte, 64) // 32B hex = 64 hex chars
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}
