-- Creates the extra databases used by tests and Playwright E2E.
-- Runs once, on first start of an empty Postgres volume.
CREATE DATABASE cvforge_test OWNER nexora;
CREATE DATABASE cvforge_e2e OWNER nexora;
