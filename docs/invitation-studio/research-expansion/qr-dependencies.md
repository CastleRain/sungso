# Local QR encoder

`qrcode-generator.mjs` is the unmodified `dist/qrcode.mjs` from the official npm package `qrcode-generator` 2.0.4, by Kazuhiko Arase, MIT licensed. `qrcode-generator.LICENSE` is the project's MIT text. The browser never requests a third-party QR service.

- Project: https://github.com/kazuhikoarase/qrcode-generator
- Package: https://registry.npmjs.org/qrcode-generator/2.0.4
- Archive: https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz
- Verified archive SHA-512 (base64): `mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==`
- License source: https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/master/LICENSE

Scan verification uses the unmodified official jsQR 1.4.0 `dist/jsQR.js`, stored as `tests/vendor/jsQR.cjs`, plus its Apache-2.0 license. These test files are not copied by the invitation build.

- Decoder project: https://github.com/cozmo/jsQR
- Archive: https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz
- Verified archive SHA-512 (base64): `dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==`
