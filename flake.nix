{
  description = "TypeBox-based OpenAPI Server + Client";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    flakeUtils.follows = "hotPot/flakeUtils";
    nixpkgs.follows = "hotPot/nixpkgs";
    npmlock2nix = {
      url = "github:nix-community/npmlock2nix/master";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flakeUtils, hotPot, npmlock2nix }:
    flakeUtils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfreePredicate = pkg: builtins.elem (pkgs.lib.getName pkg) [
              "ngrok"
            ];
          };
        };
        hotPotPkgs = hotPot.packages.${system};
        deno = hotPotPkgs.deno;
        vscodeSettings = pkgs.writeTextFile {
          name = "vscode-settings.json";
          text = builtins.toJSON {
            "deno.enable" = true;
            "deno.lint" = true;
            "deno.unstable" = true;
            "deno.path" = deno + "/bin/deno";
            "deno.suggest.imports.hosts" = {
              "https://deno.land" = false;
            };
            "editor.tabSize" = 2;
            "[typescript]" = {
              "editor.defaultFormatter" = "denoland.vscode-deno";
              "editor.formatOnSave" = true;
            };
            "nix.enableLanguageServer" = true;
            "nix.formatterPath" = pkgs.nixpkgs-fmt + "/bin/nixpkgs-fmt";
            "nix.serverPath" = pkgs.rnix-lsp + "/bin/rnix-lsp";
          };
        };
        oas-tools = pkgs.callPackage ./nix/oas-tools {
          npmlock2nix = (import npmlock2nix { inherit pkgs; }).v2;
          nodejs = pkgs.nodejs_20;
        };
      in
      rec {
        devShell = pkgs.mkShellNoCC {
          buildInputs = [
            deno
            oas-tools
          ] ++ builtins.attrValues {
            inherit (pkgs)
              nodejs_20;
          };
          shellHook = ''
            mkdir -p ./.vscode
            cat ${vscodeSettings} > ./.vscode/settings.json
          '';
        };
        defaultPackage = devShell.inputDerivation;
      }
    );
}
