package service

import "testing"

// TestNewCacheServiceDefaultsCapacity pins that a non-positive capacity falls
// back to the named default rather than a magic literal.
func TestNewCacheServiceDefaultsCapacity(t *testing.T) {
	if got := NewCacheService(0).capacity; got != DefaultLRUCapacity {
		t.Fatalf("NewCacheService(0).capacity = %d, want %d", got, DefaultLRUCapacity)
	}
	if got := NewCacheService(-1).capacity; got != DefaultLRUCapacity {
		t.Fatalf("NewCacheService(-1).capacity = %d, want %d", got, DefaultLRUCapacity)
	}
	if got := NewCacheService(7).capacity; got != 7 {
		t.Fatalf("NewCacheService(7).capacity = %d, want 7", got)
	}
}
