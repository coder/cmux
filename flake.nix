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

        # Extract revision from the flake source
        # This will be the commit hash, branch, or tag used in 'nix run'
        revision = self.rev or self.dirtyRev or "main";

        cmux = pkgs.writeShellScriptBin "cmux" ''
          # Ensure we have a working directory for cmux
          export CMUX_HOME="''${CMUX_HOME:-$HOME/.cmux}"
          mkdir -p "$CMUX_HOME"
          
          # The revision/branch we want to run (from flake)
          CMUX_REVISION="${revision}"
          
          # Clone or update cmux repository
          CMUX_REPO="$CMUX_HOME/repo"
          if [ ! -d "$CMUX_REPO" ]; then
            echo "First run: cloning cmux repository..."
            ${pkgs.git}/bin/git clone https://github.com/coder/cmux.git "$CMUX_REPO"
            cd "$CMUX_REPO"
            ${pkgs.git}/bin/git checkout "$CMUX_REVISION"
          else
            cd "$CMUX_REPO"
            
            # Check if we need to update (only if online)
            if ${pkgs.git}/bin/git fetch origin "$CMUX_REVISION" --quiet 2>/dev/null; then
              LOCAL=$(${pkgs.git}/bin/git rev-parse HEAD)
              REMOTE=$(${pkgs.git}/bin/git rev-parse "origin/$CMUX_REVISION" 2>/dev/null || echo "$LOCAL")
              
              if [ "$LOCAL" != "$REMOTE" ] && [ -n "$REMOTE" ]; then
                echo "Updating cmux to latest version..."
                ${pkgs.git}/bin/git reset --hard "origin/$CMUX_REVISION"
                # Clear node_modules to force reinstall after successful update
                rm -rf node_modules
              fi
            fi
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

