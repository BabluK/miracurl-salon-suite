.PHONY: lint lint-backend lint-frontend test

lint: lint-backend lint-frontend
	@echo "✅ All lint checks passed"

lint-backend:
	@echo "── ruff (backend) ──"
	cd backend && ruff check . --exclude tests --select F,E7,E9
	@echo "── ruff (tests, relaxed) ──"
	cd backend && ruff check tests --select F,E9,E712
	@echo "── pylint undefined-vars ──"
	cd backend && pylint --disable=all --enable=E0601,E0602,E0606 \
		server.py routes/ services/ email_service.py sms_service.py \
		security.py database.py models.py

lint-frontend:
	@echo "── eslint (react hooks + empty blocks) ──"
	cd frontend && npx eslint src

test:
	cd backend && REACT_APP_BACKEND_URL=$$(grep REACT_APP_BACKEND_URL ../frontend/.env | cut -d '=' -f2) \
		python -m pytest tests/ -q
