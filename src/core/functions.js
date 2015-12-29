import $ from 'jquery';

function startSelection(state, {dataProvider}) {
  const {availableItems: items} = dataProvider;
  const selectedItemIndex = state.selectedItem ? items.findIndex(item => {
    return dataProvider.identity(item) === dataProvider.identity(state.selectedItem);
  }) : -1;
  return $.extend({}, state, {
    open: true,
    activeItemIndex: selectedItemIndex >= 0 ? selectedItemIndex : 0,
    selectedItemIndex,
  });
}

function activatePreviousItem(state) {
  return $.extend({}, state, {
    activeItemIndex: Math.max(state.activeItemIndex - 1, 0),
  });
}

function activateNextItem(state, options) {
  return $.extend({}, state, {
    activeItemIndex: Math.min(state.activeItemIndex + 1, options.dataProvider.items.length - 1),
  });
}

function activateItemAtIndex(state, options, index) {
  return $.extend({}, state, {
    activeItemIndex: index,
  });
}

function cancelSelection(state, options) {
  const targetState = changeQuery(state, options, '');
  targetState.open = false;
  return targetState;
}

function selectItemAtIndex(state, options, index) {
  const selectedItem = options.dataProvider.items[index];

  // notify the outside world about the selection
  options.onSelect(selectedItem);

  // the index must be adjusted to represent the item in the availableItems array
  const selectedItemIndex = selectedItem ? options.dataProvider.availableItems.findIndex(item => {
    return options.dataProvider.identity(item) === options.dataProvider.identity(selectedItem);
  }) : -1;

  const targetState = cancelSelection(state, options);
  targetState.selectedItem = selectedItem;
  targetState.selectedItemIndex = selectedItemIndex;
  return targetState;
}

function selectActiveItem(state, options) {
  const index = state.activeItemIndex;
  return selectItemAtIndex(state, options, index);
}

function toggleExtendedMode(state) {
  return $.extend({}, state, {
    extendedModeEnabled: !state.extendedModeEnabled,
  });
}

function changeQuery(state, options, query) {
  if (query !== state.query) {
    options.dataProvider.filter(query);
    return $.extend({}, state, {
      query: query,
      activeItemIndex: 0,
    });
  }
  return state;
}

function startLoading(state) {
  return $.extend({}, state, {
    itemsLoading: true,
  });
}

function finishLoading(state) {
  return $.extend({}, state, {
    itemsLoading: false,
    itemsLoaded: true,
  });
}

const actions = {
  startSelection,
  cancelSelection,
  changeQuery,
  activateItemAtIndex,
  activatePreviousItem,
  activateNextItem,
  selectItemAtIndex,
  selectActiveItem,
  toggleExtendedMode,
  startLoading,
  finishLoading,
};

export default actions;
