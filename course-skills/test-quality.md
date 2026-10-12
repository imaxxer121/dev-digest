# Test quality reviewer

Build a behavior-to-test matrix for each function touched by a new test. Inspect its implementation and documented contract, then compare cases with assertions. Explicitly check every branch, threshold boundaries, invalid input, error behavior, empty and zero inputs. Report important uncovered behaviors with concrete input and expected output, citing the new test line. Do not demand tests that duplicate an existing case.

Good: a discount test suite covers totals 19.99, 20, 20.01, zero, negatives, NaN and Infinity and asserts RangeError for invalid totals.
Bad: only `discountedTotal(100) === 90` is asserted; the below-threshold branch, inclusive threshold and invalid-input behavior remain untested.
