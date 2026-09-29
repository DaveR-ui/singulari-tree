package grpc

import (
	"context"
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

// grpcCodeFor maps a domain error code to the closest gRPC status code.
func grpcCodeFor(appCode string) codes.Code {
	switch appCode {
	case domain.ErrCodeRepoNotFound, domain.ErrCodeCommitNotFound, domain.ErrCodeBranchNotFound:
		return codes.NotFound
	case domain.ErrCodeNotAGitRepo, domain.ErrCodeInvalidOid,
		domain.ErrCodeDetachedHead, domain.ErrCodeStageFailed,
		domain.ErrCodeCommitFailed, domain.ErrCodeCheckoutFailed,
		domain.ErrCodeDiffFailed:
		return codes.InvalidArgument
	case domain.ErrCodeBranchExists:
		return codes.AlreadyExists
	case domain.ErrCodeUnauthenticated:
		return codes.Unauthenticated
	case domain.ErrCodeQueueFull:
		return codes.ResourceExhausted
	case domain.ErrCodeGoCoreUnavailable:
		return codes.Unavailable
	case domain.ErrCodeNotImplemented:
		return codes.Unimplemented
	case domain.ErrCodeFetchFailed, domain.ErrCodePushFailed:
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
		_ = googlegrpc.SetTrailer(ctx, metadata.Pairs(appErrorTrailerKey, appErr.Code))
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
