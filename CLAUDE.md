## Agent instructions

## Project goals

- Sane defaults, minimal configuration

## Architecture notes

- Lean into modularity and a clean separation of concerns
- Minimize API surface area between modules
- Minimize extraneous renders - panes should only request re-render when their visual state actually changes

## Questions vs. Instructions

When the user poses a question, like `Should module X do Y?` or `Can we do Z?`, emit an answer
as standard output and do not assume the user wants the change implemented.

## Complex, algorithmic issues

When dealing with a complex issue, particularly in the domain of rendering, eagerly search
the web for prior art and relevant algorithms.
