package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/SingulariTree/go-core/internal/domain"
	"github.com/SingulariTree/go-core/internal/service"
)

// stubRepoPort is a minimal domain.RepoPort double recording the calls the
// service makes so delegation and error propagation can be asserted.
type stubRepoPort struct {
	opened      *domain.Repository
	openErr     error
	list        []domain.Repository
	listErr     error
	get         *domain.Repository
	getErr      error
	removeErr   error
	removedID   domain.RepositoryId
	removeCalls int
}

func (p *stubRepoPort) Open(context.Context, string) (*domain.Repository, error) {
	return p.opened, p.openErr
}

func (p *stubRepoPort) List(context.Context) ([]domain.Repository, error) {
	return p.list, p.listErr
}

func (p *stubRepoPort) Remove(_ context.Context, id domain.RepositoryId) error {
	p.removeCalls++
	p.removedID = id
	return p.removeErr
}

func (p *stubRepoPort) Get(context.Context, domain.RepositoryId) (*domain.Repository, error) {
	return p.get, p.getErr
}

func TestRemoveNilPortReturnsRepoNotFound(t *testing.T) {
	svc := service.NewRepoService(nil, nil)

	err := svc.Remove(context.Background(), "repo-1")

	var appErr domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("err = %v, want domain.AppError", err)
	}
	if appErr.Code != domain.ErrCodeRepoNotFound {
		t.Errorf("code = %q, want %q", appErr.Code, domain.ErrCodeRepoNotFound)
	}
}

func TestRemoveDelegatesToPort(t *testing.T) {
	port := &stubRepoPort{}
	svc := service.NewRepoService(port, nil)

	if err := svc.Remove(context.Background(), "repo-42"); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if port.removeCalls != 1 {
		t.Errorf("removeCalls = %d, want 1", port.removeCalls)
	}
	if port.removedID != "repo-42" {
		t.Errorf("removedID = %q, want repo-42", port.removedID)
	}
}

func TestRemovePropagatesPortError(t *testing.T) {
	sentinel := errors.New("boom")
	port := &stubRepoPort{removeErr: sentinel}
	svc := service.NewRepoService(port, nil)

	if err := svc.Remove(context.Background(), "repo-1"); !errors.Is(err, sentinel) {
		t.Fatalf("err = %v, want sentinel", err)
	}
}
