# SCIP test fixtures

`py.scip` and `go.scip` are real indexer output, committed so the tests run without the indexers.
Regenerate them after changing the sources in `py/` or `go/`:

```bash
# scip-python 0.6.8 (npm @sourcegraph/scip-python@0.6.8)
cd py && scip-python index . --project-name shop --project-version 0.0.0 --output ../py.scip --quiet
# scip-go v0.2.9 (go install github.com/scip-code/scip-go/cmd/scip-go@v0.2.9)
cd go && CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-mod=readonly \
  scip-go index --output ../go.scip --quiet --module-version 0.0.0 --repository-remote example.com/store
```

`py/shop/models.py` keeps two cases the resolver depends on: `@overload` stubs before an
implementation (scip-python marks only the first stub as the definition), and a class that
shadows a builtin name (scip-python 0.6.8 records its definition as a reference to the builtin).
