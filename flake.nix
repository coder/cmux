{
  description = "cmux - coder multiplexer";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        cmux = pkgs.stdenv.mkDerivation rec {
          pname = "cmux";
          version = self.rev or self.dirtyRev or "dev";

          src = ./.;

          nativeBuildInputs = with pkgs; [
            bun
            nodejs
            makeWrapper
            gnumake
            git # Needed by scripts/generate-version.sh
          ];

          buildInputs = with pkgs; [
            electron
          ];

          # Fetch dependencies in a separate fixed-output derivation
          offlineCache = pkgs.stdenvNoCC.mkDerivation {
            name = "cmux-deps-${version}";

            inherit src;

            nativeBuildInputs = [
              pkgs.bun
              pkgs.cacert
            ];

            # Don't patch shebangs in node_modules - it creates /nix/store references
            dontPatchShebangs = true;
            dontFixup = true;

            buildPhase = ''
              export HOME=$TMPDIR
              export BUN_INSTALL_CACHE_DIR=$TMPDIR/.bun-cache
              bun install --frozen-lockfile --no-progress
            '';

            installPhase = ''
              mkdir -p $out
              cp -r node_modules $out/
            '';

            outputHashMode = "recursive";
            outputHash = "sha256-doqJkN6tmwc/4ENop2E45EeFNJ2PWw2LdR1w1MgXW7k=";
          };

          configurePhase = ''
            export HOME=$TMPDIR
            # Use pre-fetched dependencies (copy so tools can write to it)
            cp -r ${offlineCache}/node_modules .
            chmod -R +w node_modules

            # Patch shebangs in node_modules binaries and scripts
            patchShebangs node_modules
            patchShebangs scripts
          '';

          buildPhase = ''
            echo "Building cmux with make..."
            make build
          '';

          installPhase = ''
            mkdir -p $out/lib/cmux
            mkdir -p $out/bin

            # Copy built files and runtime dependencies
            cp -r dist $out/lib/cmux/
            cp -r node_modules $out/lib/cmux/
            cp package.json $out/lib/cmux/

            # Create wrapper script
            makeWrapper ${pkgs.electron}/bin/electron $out/bin/cmux \
              --add-flags "$out/lib/cmux/dist/main.js" \
              --prefix PATH : ${
                pkgs.lib.makeBinPath [
                  pkgs.git
                  pkgs.bash
                ]
              }
          '';

          meta = with pkgs.lib; {
            description = "cmux - coder multiplexer";
            homepage = "https://github.com/coder/cmux";
            license = licenses.agpl3Only;
            platforms = platforms.linux ++ platforms.darwin;
            mainProgram = "cmux";
          };
        };
      in
      {
        packages.default = cmux;
        packages.cmux = cmux;

        formatter = pkgs.nixfmt-rfc-style;

        apps.default = {
          type = "app";
          program = "${cmux}/bin/cmux";
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            git
            bash
            nixfmt-rfc-style

            # Terminal bench
            uv
            asciinema

            # Playwright dependencies for screenshot generation
            playwright-driver.browsers
          ];

          # Set up library paths for Playwright
          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
          '';
        };
      }
    );
}
