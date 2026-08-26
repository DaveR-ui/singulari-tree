package domain

import "fmt"

// AppError is the typed envelope shared across domain, service, and wire (errors.proto).
// Code maps to ErrorCode enum; Message is human-readable; Details carries context.
type AppError struct {
	Code    string
	Message string
	Details map[string]string
}

func (e AppError) Error() string {
	if e.Message == "" {
		return e.Code
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// WithDetail returns a copy with an added detail entry.
func (e AppError) WithDetail(k, v string) AppError {
	details := make(map[string]string, len(e.Details)+1)
	for kk, vv := range e.Details {
		details[kk] = vv
	}
	details[k] = v
	return AppError{Code: e.Code, Message: e.Message, Details: details}
}

// Common error codes (mirrors errors.proto ErrorCode, code strings used on wire)
const (
	ErrCodeRepoNotFound      = "REPO_NOT_FOUND"
	ErrCodeNotAGitRepo       = "NOT_A_GIT_REPO"
	ErrCodeCommitNotFound    = "COMMIT_NOT_FOUND"
	ErrCodeInvalidOid        = "INVALID_OID"
	ErrCodeBranchNotFound    = "BRANCH_NOT_FOUND"
	ErrCodeBranchExists      = "BRANCH_EXISTS"
	ErrCodeDetachedHead      = "DETACHED_HEAD"
	ErrCodeIpcUnavailable    = "IPC_UNAVAILABLE"
	ErrCodeGoCoreUnavailable = "GO_CORE_UNAVAILABLE"
	ErrCodeQueueFull         = "QUEUE_FULL"
	ErrCodeStageFailed       = "STAGE_FAILED"
	ErrCodeCommitFailed      = "COMMIT_FAILED"
	ErrCodeCheckoutFailed    = "CHECKOUT_FAILED"
	ErrCodeFetchFailed       = "FETCH_FAILED"
	ErrCodePushFailed        = "PUSH_FAILED"
	ErrCodeDiffFailed        = "DIFF_FAILED"
	ErrCodeWatchFailed       = "WATCH_FAILED"
	ErrCodeUnauthenticated   = "UNAUTHENTICATED"
	// GitHub OAuth prototype (auth.proto)
	ErrCodeGitHubAuthFailed  = "GITHUB_AUTH_FAILED"
	ErrCodeGitHubApiFailed   = "GITHUB_API_FAILED"
	ErrCodeMissingClientId   = "MISSING_CLIENT_ID"
	ErrCodeTokenNotFound     = "TOKEN_NOT_FOUND"
	ErrCodeOAuthCancelled    = "OAUTH_CANCELLED"
	ErrCodeOAuthStateMismatch = "OAUTH_STATE_MISMATCH"
)
