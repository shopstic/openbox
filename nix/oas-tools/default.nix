{ npmlock2nix
, runCommandLocal
, nodejs
}:
let
  mod = npmlock2nix.node_modules {
    src = ./src;
    inherit nodejs;
  };
in
runCommandLocal "json2ts" { } ''
  mkdir -p $out/bin
  ln -s "${mod}/bin/oas-tools" $out/bin/oas-tools
''
