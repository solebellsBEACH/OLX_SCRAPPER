# Project Instructions

## Goal

This project is a frontend for analyzing vehicle listings collected from OLX.

The application should help non-technical users quickly understand:

- whether a vehicle price is good compared to the market
- whether mileage is normal or unusual
- whether the listing contains inconsistencies or risks
- how the vehicle compares with similar listings
- whether the listing deserves further investigation

The UI must prioritize decision-making over raw statistics.

---

## Working rules

Before changing code:

1. Inspect the existing project structure.
2. Read the relevant components, hooks, stores and types.
3. Reuse existing components whenever possible.
4. Preserve the current visual identity unless explicitly asked otherwise.
5. Do not rewrite working features unnecessarily.
6. Do not change API contracts unless strictly necessary.
7. Do not invent backend fields that do not exist.
8. If a metric is not available yet, support an optional/mocked value without breaking existing data.

Never speculate about code that has not been inspected.

---

## Scope discipline

Avoid over-engineering.

Only make changes that are requested or clearly required to implement them.

Do not:

- refactor unrelated files
- create unnecessary abstractions
- introduce new state-management libraries
- replace existing UI libraries
- change routing without necessity
- redesign the whole project when a component-level change is sufficient
- add large dependencies for simple problems

Prefer small, incremental, reversible changes.

---

## UX principles

The target audience is a normal vehicle buyer, not a data analyst.

The user should understand the important information within a few seconds.

Use progressive disclosure:

### Level 1
Decision-oriented summary.

Examples:

- Boa oportunidade
- Preço acima do mercado
- Quilometragem muito baixa
- 2 alertas para verificar

### Level 2
Explain why.

Example:

"Este veículo está aproximadamente 10% acima da faixa esperada, mas possui quilometragem muito inferior à média de veículos semelhantes."

### Level 3
Advanced statistics.

Examples:

- percentile
- median
- deviation
- anomaly score
- sample size

Advanced metrics should not dominate the main UI.

---

## Language

Prefer plain Portuguese.

Do not expose technical statistical terminology when a simpler explanation exists.

Instead of:

"Percentil 94"

Use:

"Mais caro que 94% dos veículos semelhantes"

Instead of:

"Anomaly score: 0.87"

Use:

"Quilometragem muito fora do padrão"

Instead of:

"Median deviation"

Use:

"R$ 3.500 acima do preço típico"

---

## Primary metrics

Internally the system may contain:

- opportunityScore
- priceScore
- mileageScore
- consistencyScore
- riskScore
- conservationScore
- sellerScore

The primary UI should normally expose only:

- Oportunidade
- Confiança
- Alertas

Detailed scores belong in an advanced analysis area.

---

## Status semantics

Do not rely on color alone.

Always combine:

- icon
- text
- color when appropriate

Suggested meaning:

- positive: good condition/opportunity
- attention: something worth checking
- danger: inconsistency or relevant risk
- neutral: informational

Avoid alarmist wording.

An unusual value is not automatically fraudulent.

For example, very low mileage should be described as statistically unusual and worth verifying.

---

## Vehicle detail hierarchy

Prefer this order:

1. Vehicle identity
2. Price
3. Analysis summary
4. Main insights
5. Market comparison
6. Alerts
7. Technical specifications
8. Advanced analysis

---

## Listing hierarchy

Vehicle cards/list rows should prioritize:

- image
- model
- year
- price
- mileage
- price vs market
- opportunity
- alerts

Avoid showing too many columns at once.

---

## Comparison page

When comparing vehicles:

- highlight meaningful differences
- explain tradeoffs
- avoid declaring one vehicle universally "better"
- show why each vehicle may be attractive

Focus on:

- price
- price vs market
- mileage
- year
- opportunity
- confidence
- alerts

---

## Coding style

Follow the conventions already present in the repository.

Prefer:

- TypeScript
- existing design system/components
- existing hooks/stores
- small reusable components
- clear component boundaries

Do not introduce patterns that are not already used unless necessary.

---

## Implementation workflow

For substantial frontend tasks:

1. Inspect relevant files.
2. Summarize the current implementation briefly.
3. Identify the minimum set of files that need changes.
4. Implement the change.
5. Run lint/typecheck/tests/build when available.
6. Fix regressions caused by the changes.
7. Summarize what changed.

Do not stop after suggesting code if the user asked you to implement it.

---

## Validation

Before finishing a frontend change, verify:

- existing routes still work
- TypeScript has no new errors
- data with missing optional market metrics does not crash
- long vehicle names do not break layout
- large prices do not overflow
- desktop layout remains usable
- narrow layouts remain usable
- loading/empty states are preserved

Do not modify unrelated code merely to make formatting cleaner.