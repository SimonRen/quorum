# Quorum — release & dev tasks
# Source of truth for version is mcp-server/package.json.
# Publishing uses npm web-based 2FA: `npm publish` prints a browser auth URL —
# open it, approve, done. `npm publish` auto-runs the build via prepublishOnly.

DIR     := mcp-server
PKG     := $(DIR)/package.json
NAME    := $(shell node -p "require('./$(DIR)/package.json').name")
VERSION := $(shell node -p "require('./$(DIR)/package.json').version")
TAG     := v$(VERSION)

.DEFAULT_GOAL := help
.PHONY: help install build test check publish verify tag release

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*## "}{printf "  %-10s %s\n",$$1,$$2}'
	@echo ""
	@echo "  current: $(NAME)@$(VERSION)  (tag $(TAG))"

install: ## Install deps (mcp-server)
	npm --prefix $(DIR) install

build: ## Compile TypeScript -> dist/
	npm --prefix $(DIR) run build

test: ## Run the vitest suite
	npm --prefix $(DIR) test

check: build test ## Build + test (pre-release gate)

publish: check ## Local publish to npm (npm web 2FA — opens a browser)
	@if npm view $(NAME)@$(VERSION) version >/dev/null 2>&1; then \
		echo "x $(NAME)@$(VERSION) already published — bump version in $(PKG)"; exit 1; \
	fi
	npm publish ./$(DIR) --access public
	@$(MAKE) --no-print-directory verify

verify: ## Confirm the current version is live on npm
	@for i in 1 2 3 4 5; do \
		npm view $(NAME)@$(VERSION) version >/dev/null 2>&1 && { echo "ok $(NAME)@$(VERSION) is live"; exit 0; }; \
		echo "... waiting for registry ($$i)"; sleep 2; \
	done; \
	echo "x $(NAME)@$(VERSION) not visible yet — check: npm view $(NAME) version"; exit 1

tag: ## Create + push git tag vX.Y.Z (must match package.json)
	@git rev-parse $(TAG) >/dev/null 2>&1 && { echo "x tag $(TAG) already exists"; exit 1; } || true
	git tag $(TAG)
	git push origin $(TAG)

release: ## Full local release: check -> publish -> tag + push
	@$(MAKE) --no-print-directory publish
	@$(MAKE) --no-print-directory tag
	@echo "ok released $(NAME)@$(VERSION) ($(TAG))"
