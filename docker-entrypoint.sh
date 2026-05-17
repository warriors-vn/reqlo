#!/bin/sh
set -e

# Entry point that detects whether the project uses Vite or Create React App (CRA)
# and runs the appropriate dev command with host binding so the server is accessible
# from the Docker host. This allows the same image to be reused for different setups.

APP_DIR=/app

detect_tool() {
  # If FRONTEND_TOOL env is set and not 'auto', trust it
  if [ -n "$FRONTEND_TOOL" ] && [ "$FRONTEND_TOOL" != "auto" ]; then
    echo "$FRONTEND_TOOL"
    return
  fi

  # Detect Vite by config file or dependency in package.json
  if [ -f "$APP_DIR/vite.config.ts" ] || [ -f "$APP_DIR/vite.config.js" ] || grep -Eq '"vite"' "$APP_DIR/package.json" 2>/dev/null; then
    echo "vite"
    return
  fi

  # Detect CRA by presence of react-scripts in package.json scripts/dependencies
  if grep -Eq 'react-scripts' "$APP_DIR/package.json" 2>/dev/null; then
    echo "cra"
    return
  fi

  # Fallback: inspect scripts for common names
  if grep -Eq '"dev"\s*:' "$APP_DIR/package.json" 2>/dev/null; then
    echo "dev-script"
    return
  fi

  echo "unknown"
}

run_dev_vite() {
  # Ensure host binding so container is reachable
  # Many projects support `npm run dev -- --host` forwarding extra args; we try both variants
  echo "Starting Vite dev server (binding to 0.0.0.0)..."
  if npm run -s dev -- --host 0.0.0.0; then
    exit 0
  fi
  # Some projects use `vite` script directly or need HOST env
  HOST=0.0.0.0 npm run -s dev
}

run_dev_cra() {
  # CRA respects HOST env var
  echo "Starting Create React App dev server (binding to 0.0.0.0)..."
  HOST=0.0.0.0 BROWSER=none npm start
}

run_dev_generic() {
  # Generic fallback: run `npm run dev` or `npm start` if present
  if npm run -s dev -- --host 0.0.0.0; then
    exit 0
  fi
  if HOST=0.0.0.0 npm start; then
    exit 0
  fi
  echo "No recognized dev command found (try setting FRONTEND_TOOL=vite or= cra)." >&2
  exit 1
}

case "$1" in
  dev)
    TOOL=$(detect_tool)
    echo "Detected frontend tool: $TOOL"
    cd $APP_DIR

    # If node_modules is empty (e.g. fresh container), install in container for dev
    if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null || true)" ]; then
      echo "Installing dependencies inside container (node_modules absent)..."
      if [ -f package-lock.json ]; then
        npm ci --prefer-offline --no-audit --no-fund
      else
        npm install --no-audit --no-fund
      fi
    fi

    case "$TOOL" in
      vite)
        run_dev_vite
        ;;
      cra)
        run_dev_cra
        ;;
      dev-script)
        run_dev_generic
        ;;
      unknown)
        echo "Unable to detect project type. Falling back to generic dev runner.";
        run_dev_generic
        ;;
    esac
    ;;
  *)
    # Default behavior: pass-through to the requested command (useful for `docker-compose run`)
    exec "$@"
    ;;
esac

