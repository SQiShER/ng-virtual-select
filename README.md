[![Build Status](https://travis-ci.org/SQiShER/ng-virtual-select.svg)](https://travis-ci.org/SQiShER/ng-virtual-select)

# ng-virtual-select

This is a select component with the following set of skills:

- virtual scrolling (only renders as many DOM elements as are actually visible)
- searchable
- keyboard controls
- asynchronous data-fetching via promises

This component aims to work well in rare scenarios in which select2 or selectize don't cut it. Not because they are bad (which they are not!), but because of horrible, horrible circumstances. Like being forced to load and display all entries in the dropdown. When we're talking about a couple thousand entries, this can become very slow and inefficient.

ng-virtual-select is designed to minimize DOM manipulations and memory consumption, in order to deal with large amounts of data.

## Known Issues

- Memory leak: event handlers don't get removed when the element get's destroyed
- There are no tests, yet.
- The code is a mess. It started as a proof of concept and remained that way until it reached feature completion. Once the tests are in place, I'll start refactoring to make the code easier to understand and maintain.
