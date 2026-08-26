package grpc

import (
	"context"
	"fmt"
	"log"
	"net"

	"github.com/SingulariTree/go-core/internal/service"
)

// Server is the gRPC adapter stub (transport/grpc).
// Real implementation registers singularitree.v1 GitCore service with interceptors (auth token, logging).
type Server struct {
	repoSvc    *service.RepoService
	gitSvc     *service.GitService
	graphSvc   *service.GraphService
	watcherSvc *service.WatcherService
	cacheSvc   *service.CacheService
	token      string
}

// NewServer creates a gRPC server stub.
func NewServer(repoSvc *service.RepoService, gitSvc *service.GitService, graphSvc *service.GraphService, watcherSvc *service.WatcherService, cacheSvc *service.CacheService) *Server {
	return &Server{
		repoSvc:    repoSvc,
		gitSvc:     gitSvc,
		graphSvc:   graphSvc,
		watcherSvc: watcherSvc,
		cacheSvc:   cacheSvc,
	}
}

// Serve starts the stub server (accept loop). Real impl uses grpc.NewServer + RegisterGitCoreServer.
func (s *Server) Serve(lis net.Listener) error {
	log.Printf("gRPC stub serving on %s (token auth required)", lis.Addr())
	for {
		conn, err := lis.Accept()
		if err != nil {
			return fmt.Errorf("accept: %w", err)
		}
		go func(c net.Conn) {
			defer c.Close()
			// Stub: close immediately; real gRPC handles framing
			_ = c
		}(conn)
	}
}

// Ping implements health check (ipc-strategy.md §2.2, 5s supervisor heartbeat).
func (s *Server) Ping(_ context.Context) (bool, uint64, uint32) {
	return true, 0, 0
}
