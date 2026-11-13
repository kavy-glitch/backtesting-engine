# One-command entry points. Docker targets need Docker; the others need the toolchain named in README.md.
ENGINE_BUILD ?= engine/build

.PHONY: help engine engine-test backend-test frontend-test test experiments report up down smoke

help:
	@echo "engine         build the C++ engine into $(ENGINE_BUILD)"
	@echo "engine-test    build and run the 51 C++ unit tests"
	@echo "backend-test   run the 79 pytest tests (needs MySQL; see docs/testing.md)"
	@echo "frontend-test  run the 49 Vitest tests"
	@echo "experiments    regenerate every number in the report's Chapter 7 (experiments/*.json)"
	@echo "report         rebuild report/report.pdf from report/report.tex"
	@echo "up / down      start / stop the Docker stack;  smoke = end-to-end check of the running stack"

engine:
	cmake -S engine -B $(ENGINE_BUILD) -DPBE_BUILD_TESTS=ON
	cmake --build $(ENGINE_BUILD) -j

engine-test: engine
	$(ENGINE_BUILD)/engine_tests

backend-test: engine
	cd backend && PBE_ENGINE_PATH=$(abspath $(ENGINE_BUILD))/engine python -m pytest tests -q

frontend-test:
	cd frontend && npm ci && npm test -- --run && npm run build

test: engine-test backend-test frontend-test

experiments: engine
	python experiments/reproduce_report.py --engine $(ENGINE_BUILD)/engine
	python experiments/robustness.py --engine $(ENGINE_BUILD)/engine --paths 200

report:
	cd report && latexmk -pdf -interaction=nonstopmode report.tex

up:
	docker compose up --build -d

down:
	docker compose down

smoke:
	docker compose exec api python -m scripts.smoke_test
