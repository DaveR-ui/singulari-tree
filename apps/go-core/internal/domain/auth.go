package domain

import "context"

// GitHubUser mirrors auth.proto GitHubUser (subset for prototype demo).
type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
	HTMLURL   string `json:"html_url"`
}

// GitHubRepo mirrors auth.proto GitHubRepo.
type GitHubRepo struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	FullName        string `json:"full_name"`
	Private         bool   `json:"private"`
	HTMLURL         string `json:"html_url"`
	Description     string `json:"description"`
	Language        string `json:"language"`
	StargazersCount int32  `json:"stargazers_count"`
	UpdatedAt       string `json:"updated_at"`
}

// AuthPort is driven port for GitHub OAuth + API (hexagonal).
// Implemented by adapter/github (http.Client injectable).
type AuthPort interface {
	ExchangeCode(ctx context.Context, code string) (string, error)
	GetUser(ctx context.Context, token string) (*GitHubUser, error)
	ListRepos(ctx context.Context, token string) ([]GitHubRepo, error)
}

// TokenStore holds GitHub token in-memory (prototype). Later replaced by secure storage.
type TokenStore interface {
	Set(token string)
	Get() string
	Clear()
	IsAuthenticated() bool
}
