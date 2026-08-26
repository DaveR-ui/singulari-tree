package config

import (
	"os"
	"path/filepath"
)

// Config holds Go core configuration (Viper bindings: grpcAddr, httpAddr, dbPath, token, logLevel).
// In scaffold, loaded from env + defaults without external Viper dependency;
// real implementation will use Viper (github.com/spf13/viper) for config.yaml + env.
type Config struct {
	GrpcAddr string
	HttpAddr string
	DbPath   string
	Token    string
	LogLevel string
}

// Load returns Config with defaults and env overrides.
func Load() Config {
	cfg := Config{
		GrpcAddr: getEnv("SINGULARITREE_GRPC_ADDR", "127.0.0.1:0"),
		HttpAddr: getEnv("SINGULARITREE_HTTP_ADDR", "127.0.0.1:0"),
		DbPath:   getEnv("SINGULARITREE_DB_PATH", defaultDbPath()),
		Token:    os.Getenv("SINGULARITREE_TOKEN"),
		LogLevel: getEnv("SINGULARITREE_LOG_LEVEL", "info"),
	}
	return cfg
}

func defaultDbPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "./cache.db"
	}
	// Per-user locations per service-design.md §5:
	// macOS ~/Library/Application Support/singularitree/cache.db
	// Windows %APPDATA%/singularitree/cache.db
	// Linux ~/.local/share/singularitree/cache.db
	// Scaffold uses ~/.local/share fallback for portability
	dir := filepath.Join(home, ".local", "share", "singularitree")
	return filepath.Join(dir, "cache.db")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
