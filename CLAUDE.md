## Agent instructions

## Project goals

- Sane defaults, minimal configuration

## Architecture notes

- Lean into modularity and a clean separation of concerns
- Minimize API surface area between modules

## Questions vs. Instructions

When the user poses a question, like `Should module X do Y?` or `Can we do Z?`, emit an answer
as standard output and do not assume the user wants the change implemented.
