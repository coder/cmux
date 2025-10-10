{
  description = "cmux - coder multiplexer";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        cmux = pkgs.writeShellScriptBin "cmux" ''
          # Ensure we have a working directory for cmux
          export CMUX_HOME="''${CMUX_HOME:-$HOME/.cmux}"
          mkdir -p "$CMUX_HOME"
          
          # Clone or update cmux repository
          CMUX_REPO="$CMUX_HOME/repo"
          if [ ! -d "$CMUX_REPO" ]; then
            echo "First run: cloning cmux repository..."
            ${pkgs.git}/bin/git clone --depth 1 https://github.com/coder/cmux.git "$CMUX_REPO"
          fi
          
          # Check if we need to update
          cd "$CMUX_REPO"
          ${pkgs.git}/bin/git fetch origin main --quiet 2>/dev/null || true
          LOCAL=$(${pkgs.git}/bin/git rev-parse HEAD)
          REMOTE=$(${pkgs.git}/bin/git rev-parse origin/main)
          
          if [ "$LOCAL" != "$REMOTE" ]; then
            echo "Updating cmux to latest version..."
            ${pkgs.git}/bin/git pull origin main
            # Clear node_modules to force reinstall
            rm -rf node_modules
          fi
          
          # Install dependencies if needed
          if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            ${pkgs.bun}/bin/bun install --frozen-lockfile
          fi
          
          # Build if needed
          if [ ! -d "dist" ] || [ ! -f "dist/main.js" ]; then
            echo "Building cmux..."
            ${pkgs.bun}/bin/bun run build
          fi
          
          # Run the application
          exec ${pkgs.electron}/bin/electron "$CMUX_REPO/dist/main.js" "$@"
        '';
      in
      {
        packages.default = cmux;
        packages.cmux = cmux;

        apps.default = {
          type = "app";
          program = "${cmux}/bin/cmux";
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            git
            bash
            electron
          ];
        };
      }
    );
}

