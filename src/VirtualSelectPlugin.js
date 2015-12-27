import $ from 'jquery';
import Renderer from './Renderer.js';

const defaults = {
  maxVisibleItems: 10,
  maxRenderedItems: 30
};

const Keys = {
  ArrowUp: 38,
  ArrowDown: 40,
  Enter: 13,
  Escape: 27,
  Control: 17
};

function VirtualSelect(document, element, options) {

  const _options = $.extend({
    itemHeight: detectItemHeight()
  }, defaults, options);

  let _state = {
    activeItemIndex: 0,
    selectedItemIndex: -1,
    query: '',
    itemsLoading: false,
    itemsLoaded: false,
    open: false,
    clickedOutsideElement: false,
    lastMouseX: 0,
    lastMouseY: 0
  };

  function detectItemHeight() {
    const $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
    const height = $sampleItem.outerHeight();
    $sampleItem.remove();
    return height;
  }

  function indexOfItem(itemToFind = {}) {
    const dataProvider = _options.dataProvider;
    const itemToFindIdentity = dataProvider.identity(itemToFind);
    return dataProvider.availableItems.findIndex(item => dataProvider.identity(item) === itemToFindIdentity);
  }

  function loadItems(state, options) {
    if (state.itemsLoaded) {
      return Promise.resolve();
    } else {
      state.itemsLoading = true;
      return options.dataProvider.load().then(() => {
        state.itemsLoading = false;
        state.itemsLoaded = true;
      });
    }
  }

  function initDOM($element) {
    const $container = $('<div/>').addClass('ui-virtual-select');
    $element.empty().append($container);

    const $searchInput = $('<input type="text"/>').addClass('ui-virtual-select--search-input');
    const $loadingIndicator = $('<div/>').addClass('ui-virtual-select--loading-indicator').text('Loading...').hide();
    const $items = $('<div/>').addClass('ui-virtual-select--items').css('overflow-y', 'scroll').hide();
    $container.append($searchInput, $loadingIndicator, $items);

    const $canvas = $('<div/>').addClass('ui-virtual-select--canvas');
    $items.append($canvas);

    return {
      $element,
      $searchInput,
      $container,
      $loadingIndicator,
      $items,
      $canvas
    };
  }

  function startSelection(state) {
    const selectedItemIndex = indexOfItem(state.selectedItem);
    return $.extend(state, {
      open: true,
      activeItemIndex: selectedItemIndex >= 0 ? selectedItemIndex : 0,
      selectedItemIndex
    });
  }

  function activatePreviousItem(state) {
    return $.extend(state, {
      activeItemIndex: Math.max(state.activeItemIndex - 1, 0)
    });
  }

  function activateNextItem(state, options) {
    return $.extend(state, {
      activeItemIndex: Math.min(state.activeItemIndex + 1, options.dataProvider.items.length - 1)
    });
  }

  function cancel(state) {
    return $.extend(state, {
      open: false,
      query: ''
    });
  }

  function selectActiveItem(state) {
    const targetState = cancel(state);
    targetState.selectedItemIndex = targetState.activeItemIndex + state.firstRenderedItemIndex;
    return targetState;
  }

  function toggleExtendedMode(state) {
    return $.extend(state, {
      extendedModeEnabled: !state.extendedModeEnabled
    });
  }

  function changeQuery(state, query) {
    if (query !== state.query) {
      return $.extend(state, {
        query: query,
        activeItemIndex: 0
      });
    } else {
      return state;
    }
  }

  function initDOMEventHandlers(dom, state, options, renderer) {

    function noop() {
    }

    function onlyAfterClickOutside(callback) {
      return function() {
        return _state.clickedOutsideElement ? callback() : noop();
      };
    }

    function onlyIfMousePositionChanged(callback) {
      return function(event) {
        // workaround to prevent scripted scrolling from triggering mousemove events
        const {lastMouseX: previousX, lastMouseY: previousY} = _state;
        const {pageX: currentX, pageY: currentY} = event;
        return (currentX !== previousX || currentY !== previousY) ? callback(event) : noop();
      };
    }

    $(document).on('mousedown', function(event) {
      _state.clickedOutsideElement = !$.contains(element[0], event.target);
    });

    dom.$searchInput
      .on('focus', function() {
        loadItems(_state, options).then(function() {
          const targetState = startSelection(_state);
          renderer.render(targetState);
        });
        renderer.render(_state);
      })
      .on('keydown', function(event) {
        const key = event.which;
        switch (key) {
          case Keys.ArrowUp:
            renderer.render(activatePreviousItem(_state, options));
            break;
          case Keys.ArrowDown:
            renderer.render(activateNextItem(_state, options));
            break;
          case Keys.Enter:
            renderer.render(selectActiveItem(_state, options));
            break;
          case Keys.Escape:
            renderer.render(cancel(_state, options));
            break;
          case Keys.Control:
            renderer.render(toggleExtendedMode(_state, options));
            break;
          default:
            _state.clickedOutsideElement = true;
            renderer.render(_state);
            break;
        }
      })
      .on('blur', onlyAfterClickOutside(function() {
        const targetState = cancel(_state, options);
        renderer.render(targetState);
      }))
      .on('keyup', function(event) {
        const query = $(event.target).val();
        const targetState = changeQuery(_state, query);
        renderer.render(targetState);
      });

    dom.$items.on('scroll', _.throttle(() => {
      renderer.render();
    }, 10));

    dom.$canvas
      .on('mousemove', _.throttle(event => {
        _state.lastMouseX = event.pageX;
        _state.lastMouseY = event.pageY;
      }, 50))
      .on('mousemove', '.ui-virtual-select--item', onlyIfMousePositionChanged(function(event) {
        const activeItemIndex = $(event.currentTarget).data('index');
        if (activeItemIndex !== _state.activeItemIndex) {
          _state.activeItemIndex = activeItemIndex;
          renderer.render(_state);
        }
      }))
      .on('click', '.ui-virtual-select--item', function(event) {
        const targetState = cancel(_state);
        targetState.selectedItemIndex = $(event.currentTarget).data('index'); // TODO probably needs adjustmnts for jquery event filtering
        renderer.render(targetState);
      });
  }

  const _dom = initDOM(element, options);
  const _renderer = new Renderer(_dom, _options);

  initDOMEventHandlers(_dom, _state, _options, _renderer);

  function changeState(state) {
    _state = $.extend({}, state);
    _renderer.render(_state);
  }

  changeState(_state);

}

export default VirtualSelect;
