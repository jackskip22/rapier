# Contributing to Will

Will is a standard and a reference reader under the MIT licence. Anyone can contribute and by opening a pull request, you offer your change under the same MIT licence as the rest.

- **A bug in the reader or a vector that disagrees with the text:** open an issue with the vector, or a pull request
  that adds it to `vectors.json` red first.
- **A change to the standard's words:** open an issue first; the words are the standard, so they move slowly and
  with reasons. The README must still parse to no region and no fault (the workflow checks).
- **A reader in another language:** implement this README and `vectors.json` independently. The Python and Go
  hosts in `hosts/` use only standard libraries. Run each host's check command before submitting a change.

Rapier, which carries Will, is at
[github.com/jackskip22/rapier](https://github.com/jackskip22/rapier).
