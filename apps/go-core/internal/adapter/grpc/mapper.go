package grpc

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	googlegrpc "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	singularitreev1 "github.com/SingulariTree/go-core/gen/go/singularitree/v1"
	"github.com/SingulariTree/go-core/internal/domain"
)

// appErrorTrailerKey carries the domain error code alongside the gRPC status
// (ipc-strategy.md §2.5).
const appErrorTrailerKey = "x-app-error-code"

// appErrorDetailsTrailerKey carries AppError.Details (structured fields only)
// as a JSON object. Secrets/tokens are never placed here
// (github-real-data-guide.md §12e).
const appErrorDetailsTrailerKey = "x-app-error-details"

func oidToProto(o domain.Oid) *singularitreev1.Oid {
	return &singularitreev1.Oid{Hex: o.Hex, Kind: o.Kind}
}

func signatureToProto(s domain.Signature) *singularitreev1.Signature {
	return &singularitreev1.Signature{
		Name:  s.Name,
		Email: s.Email,
		When:  s.When.Format(time.RFC3339),
	}
}

func refLabelToProto(r domain.RefLabel) *singularitreev1.RefLabel {
	return &singularitreev1.RefLabel{Name: r.Name, Kind: r.Kind}
}

func commitToProto(c domain.Commit) *singularitreev1.Commit {
	parents := make([]*singularitreev1.Oid, 0, len(c.Parents))
	for _, p := range c.Parents {
		parents = append(parents, oidToProto(p))
	}
	refs := make([]*singularitreev1.RefLabel, 0, len(c.Refs))
	for _, r := range c.Refs {
		refs = append(refs, refLabelToProto(r))
	}
	return &singularitreev1.Commit{
		Oid:         oidToProto(c.Oid),
		Parents:     parents,
		Author:      signatureToProto(c.Author),
		Committer:   signatureToProto(c.Committer),
		Message:     c.Message,
		TreeOid:     oidToProto(c.TreeOid),
		CommittedAt: c.CommittedAt.Format(time.RFC3339),
		Refs:        refs,
	}
}

// laneToProto maps a domain lane to its wire form. Index/Color are range-safe
// (lane indices are bounded by the number of active graph columns).
func laneToProto(l domain.Lane) *singularitreev1.Lane {
	return &singularitreev1.Lane{
		Index:     int32(l.Index),
		Color:     int32(l.Color),
		Continues: l.Continues,
	}
}

// branchToProto maps a domain branch to its wire form. The tip is omitted when
// unset so the optional Oid field stays absent.
func branchToProto(b domain.Branch) *singularitreev1.Branch {
	out := &singularitreev1.Branch{
		Name:      b.Name,
		RefName:   b.RefName.Raw,
		IsCurrent: b.IsCurrent,
		IsRemote:  b.IsRemote,
		Behind:    b.Behind,
	}
	if b.Tip.Hex != "" {
		out.Tip = oidToProto(b.Tip)
	}
	if b.Upstream != nil {
		out.Upstream = b.Upstream.Raw
	}
	return out
}

// remoteToProto maps a domain remote to its wire form. Slices are always
// non-nil so an empty remote serializes as an empty repeated field.
func remoteToProto(r domain.Remote) *singularitreev1.Remote {
	urls := make([]string, 0, len(r.Urls))
	urls = append(urls, r.Urls...)
	fetchSpecs := make([]string, 0, len(r.FetchSpecs))
	fetchSpecs = append(fetchSpecs, r.FetchSpecs...)
	return &singularitreev1.Remote{
		Name:       r.Name,
		Urls:       urls,
		FetchSpecs: fetchSpecs,
	}
}

// progressToProto maps a streaming remote-operation progress chunk to its wire
// form. Percent is in 0..100 and Message is the git progress line.
func progressToProto(p domain.Progress) *singularitreev1.Progress {
	return &singularitreev1.Progress{Percent: p.Percent, Message: p.Message}
}

// tagToProto maps a domain tag to its wire form. Tagger and message are
// optional and only set for annotated tags.
func tagToProto(t domain.Tag) *singularitreev1.Tag {
	out := &singularitreev1.Tag{
		Name:      t.Name,
		RefName:   t.RefName.Raw,
		Annotated: t.Annotated,
	}
	if t.Target.Hex != "" {
		out.Target = oidToProto(t.Target)
	}
	if t.Tagger != nil {
		out.Tagger = signatureToProto(*t.Tagger)
	}
	if t.Message != nil {
		out.Message = *t.Message
	}
	return out
}

// stashToProto maps a domain stash entry to its wire form. The oid is omitted
// when unset so the optional field stays absent; branch_name is empty when the
// stash was created on a detached HEAD.
func stashToProto(s *domain.Stash) *singularitreev1.Stash {
	if s == nil {
		return nil
	}
	out := &singularitreev1.Stash{
		Index:   int32(s.Index),
		Message: s.Message,
	}
	if s.Oid.Hex != "" {
		out.Oid = oidToProto(s.Oid)
	}
	if s.BranchName != nil {
		out.BranchName = *s.BranchName
	}
	return out
}

func repositoryToProto(r *domain.Repository) *singularitreev1.Repository {
	if r == nil {
		return nil
	}
	return &singularitreev1.Repository{
		Id:           string(r.ID),
		FsPath:       r.FsPath,
		CommonDir:    r.CommonDir,
		Name:         r.Name,
		CreatedAt:    r.CreatedAt.Format(time.RFC3339),
		LastOpenedAt: r.LastOpenedAt.Format(time.RFC3339),
	}
}

func fileStatusToProto(f domain.FileStatus) *singularitreev1.FileStatus {
	return &singularitreev1.FileStatus{
		Path:         f.Path,
		Staged:       f.Staged,
		Unstaged:     f.Unstaged,
		IsStaged:     f.IsStaged,
		IsConflicted: f.IsConflicted,
	}
}

func authSourceToProto(s domain.AuthSource) singularitreev1.AuthSource {
	switch s {
	case domain.AuthSourceNone:
		return singularitreev1.AuthSource_AUTH_SOURCE_NONE
	case domain.AuthSourceGitHubCLI:
		return singularitreev1.AuthSource_AUTH_SOURCE_GITHUB_CLI
	case domain.AuthSourceOAuth:
		return singularitreev1.AuthSource_AUTH_SOURCE_OAUTH
	default:
		return singularitreev1.AuthSource_AUTH_SOURCE_UNSPECIFIED
	}
}

func authStatusToProto(s *domain.AuthStatus) *singularitreev1.AuthStatus {
	if s == nil {
		return nil
	}
	return &singularitreev1.AuthStatus{
		Authenticated: s.Authenticated,
		Source:        authSourceToProto(s.Source),
		AccountLogin:  s.AccountLogin,
		Name:          s.Name,
		AvatarUrl:     s.AvatarURL,
		Email:         s.Email,
		Scopes:        s.Scopes,
		RateLimit:     rateLimitToProto(s.RateLimit),
	}
}

func githubUserToProto(u *domain.GitHubUser) *singularitreev1.GitHubUser {
	if u == nil {
		return nil
	}
	return &singularitreev1.GitHubUser{
		Id:        u.ID,
		Login:     u.Login,
		Name:      u.Name,
		AvatarUrl: u.AvatarURL,
		Email:     u.Email,
		HtmlUrl:   u.HTMLURL,
	}
}

func githubRepoToProto(r domain.GitHubRepo) *singularitreev1.GitHubRepo {
	return &singularitreev1.GitHubRepo{
		Id:              r.ID,
		Name:            r.Name,
		FullName:        r.FullName,
		Private:         r.Private,
		HtmlUrl:         r.HTMLURL,
		Description:     r.Description,
		Language:        r.Language,
		StargazersCount: r.StargazersCount,
		UpdatedAt:       r.UpdatedAt,
		NodeId:          r.NodeID,
		DefaultBranch:   r.DefaultBranch,
		OwnerLogin:      r.OwnerLogin,
		OwnerAvatarUrl:  r.OwnerAvatarURL,
		Visibility:      r.Visibility,
		Fork:            r.Fork,
		Archived:        r.Archived,
		Disabled:        r.Disabled,
		CloneUrl:        r.CloneURL,
		SshUrl:          r.SSHURL,
		GitUrl:          r.GitURL,
		PushedAt:        r.PushedAt,
		CreatedAt:       r.CreatedAt,
		ForksCount:      r.ForksCount,
		OpenIssuesCount: r.OpenIssuesCount,
		Topics:          r.Topics,
		LicenseSpdxId:   r.LicenseSPDXID,
		IsTemplate:      r.IsTemplate,
		Homepage:        r.Homepage,
	}
}

func pageInfoToProto(p domain.PageInfo) *singularitreev1.PageInfo {
	return &singularitreev1.PageInfo{
		Page:     p.Page,
		PerPage:  p.PerPage,
		NextPage: p.NextPage,
		HasMore:  p.HasMore,
		Total:    p.Total,
	}
}

func rateLimitToProto(r *domain.RateLimit) *singularitreev1.RateLimit {
	if r == nil {
		return nil
	}
	return &singularitreev1.RateLimit{
		Resource:  r.Resource,
		Limit:     r.Limit,
		Remaining: r.Remaining,
		Reset_:    r.Reset,
		ResetAt:   r.ResetAt,
	}
}

// grpcCodeFor maps a domain error code to the closest gRPC status code.
func grpcCodeFor(appCode string) codes.Code {
	switch appCode {
	case domain.ErrCodeRepoNotFound, domain.ErrCodeCommitNotFound, domain.ErrCodeBranchNotFound:
		return codes.NotFound
	case domain.ErrCodeNotAGitRepo, domain.ErrCodeInvalidOid,
		domain.ErrCodeDetachedHead, domain.ErrCodeStageFailed,
		domain.ErrCodeCommitFailed, domain.ErrCodeCheckoutFailed,
		domain.ErrCodeStashFailed, domain.ErrCodeDiffFailed:
		return codes.InvalidArgument
	case domain.ErrCodeBranchExists:
		return codes.AlreadyExists
	case domain.ErrCodeUnauthenticated:
		return codes.Unauthenticated
	case domain.ErrCodeGHCLINotFound:
		return codes.NotFound
	case domain.ErrCodeGHCLIUnauthenticated, domain.ErrCodeGitHubTokenInvalid:
		return codes.Unauthenticated
	case domain.ErrCodeGitHubRateLimited:
		return codes.ResourceExhausted
	case domain.ErrCodeGitHubAPIError:
		return codes.Unavailable
	case domain.ErrCodeQueueFull:
		return codes.ResourceExhausted
	case domain.ErrCodeGoCoreUnavailable:
		return codes.Unavailable
	case domain.ErrCodeNotImplemented:
		return codes.Unimplemented
	case domain.ErrCodeFetchFailed, domain.ErrCodePushFailed, domain.ErrCodePullFailed:
		return codes.Unavailable
	default:
		return codes.Internal
	}
}

// appErrorToStatus converts a domain.AppError into a gRPC status error and
// attaches the domain code as trailing metadata. Non-AppError errors are passed
// through when they are already gRPC statuses, else wrapped as Internal.
func appErrorToStatus(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}

	var appErr domain.AppError
	if errors.As(err, &appErr) {
		trailer := metadata.Pairs(appErrorTrailerKey, appErr.Code)
		if len(appErr.Details) > 0 {
			// Structured fields only; never surface secrets/tokens here.
			if encoded, mErr := json.Marshal(appErr.Details); mErr == nil {
				trailer.Set(appErrorDetailsTrailerKey, string(encoded))
			}
		}
		_ = googlegrpc.SetTrailer(ctx, trailer)
		msg := appErr.Message
		if msg == "" {
			msg = appErr.Code
		}
		return status.Error(grpcCodeFor(appErr.Code), msg)
	}

	if _, ok := status.FromError(err); ok {
		return err
	}
	return status.Error(codes.Internal, err.Error())
}
