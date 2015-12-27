'use strict';

(function ($, document) {
  var pluginName = 'virtualselect';
  var defaults = {
    maxVisibleItems: 10,
    maxRenderedItems: 30
  };
  var Keys = {
    ArrowUp: 38,
    ArrowDown: 40,
    Enter: 13,
    Escape: 27,
    Control: 17
  };

  function Plugin2(element, options) {

    var _options = $.extend({
      itemHeight: detectItemHeight()
    }, defaults, options);

    var _state = {
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
      var $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
      var height = $sampleItem.outerHeight();
      $sampleItem.remove();
      return height;
    }

    function indexOfItem() {
      var itemToFind = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var dataProvider = _options.dataProvider;
      var itemToFindIdentity = dataProvider.identity(itemToFind);
      return dataProvider.availableItems.findIndex(function (item) {
        return dataProvider.identity(item) === itemToFindIdentity;
      });
    }

    function loadItems(state, options) {
      if (state.itemsLoaded) {
        return Promise.resolve();
      } else {
        state.itemsLoading = true;
        return options.dataProvider.load().then(function () {
          state.itemsLoading = false;
          state.itemsLoaded = true;
        });
      }
    }

    function Renderer(dom, options) {
      this.dom = dom;
      this.options = options;
      this.renderedState = {};
    }

    Renderer.prototype.render = function (state) {
      var _this = this;

      var self = this;

      if (arguments.length === 0) {
        // re-render
        state = this.renderedState;
      }

      // update search input placeholder
      if (state.itemsLoaded && state.selectedItemIndex !== this.renderedState.selectedItemIndex) {
        var selectedItem = this.options.dataProvider.availableItems[state.selectedItemIndex];
        var displayText = selectedItem ? this.options.dataProvider.displayText(selectedItem) : this.options.dataProvider.noSelectionText();
        this.dom.$searchInput.attr('placeholder', displayText);
      }

      // toggle loading indicator and class
      if (state.itemsLoading) {
        this.dom.$loadingIndicator.show();
        this.dom.$container.addClass('loading');
      } else {
        this.dom.$loadingIndicator.hide();
        this.dom.$container.removeClass('loading');
      }

      // toggle open state and class
      if (state.open) {
        this.dom.$items.show();
        this.dom.$container.addClass('open');
      } else {
        this.dom.$items.hide();
        this.dom.$container.removeClass('open');
      }

      if (state.open) {
        (function () {

          // okay, i know this is not the best place for this, but I currently don't know where else to put it
          if (state.query && state.query !== _this.renderedState.query) {
            _this.options.dataProvider.filter(state.query);
          }

          // adjust first item
          var scrollPosition = _this.dom.$items.scrollTop();
          var firstRenderedItemIndex = Math.max(Math.floor(scrollPosition / _this.options.itemHeight) - _this.options.maxVisibleItems, 0);

          // adjust scroll position
          if (state.activeItemIndex !== _this.renderedState.activeItemIndex) {
            var canvasSize = Math.min(_this.options.dataProvider.items.length, _this.options.maxVisibleItems) * _this.options.itemHeight;
            var targetScrollPosition = state.activeItemIndex * _this.options.itemHeight;
            var a1 = Math.ceil(scrollPosition / _this.options.itemHeight) * _this.options.itemHeight;
            var a2 = Math.floor(scrollPosition / _this.options.itemHeight) * _this.options.itemHeight + canvasSize;
            if (targetScrollPosition <= a1) {
              _this.dom.$items.scrollTop(targetScrollPosition);
            } else if (targetScrollPosition >= a2) {
              _this.dom.$items.scrollTop(targetScrollPosition - canvasSize + _this.options.itemHeight);
            }
          }

          var items = _this.options.dataProvider.get(firstRenderedItemIndex, firstRenderedItemIndex + _this.options.maxRenderedItems);

          // update items height
          var itemsElementHeight = Math.min(_this.options.maxVisibleItems, _this.options.dataProvider.items.length) * _this.options.itemHeight;
          _this.dom.$items.css({
            height: itemsElementHeight + 'px'
          });

          // update canvas size
          var firstVisibleItemIndex = Math.max(Math.floor(_this.dom.$items.scrollTop() / _this.options.itemHeight) - _this.options.maxVisibleItems, 0);
          var canvasElementMarginTop = firstVisibleItemIndex * _this.options.itemHeight;
          var canvasElementHeight = _this.options.dataProvider.items.length * _this.options.itemHeight - firstVisibleItemIndex * _this.options.itemHeight;
          _this.dom.$canvas.css({
            'height': canvasElementHeight + 'px',
            'margin-top': canvasElementMarginTop + 'px'
          });

          // create dom elements if necessary
          items.forEach(function (item, index) {
            var $itemElement = _this.dom.$canvas.children('.ui-virtual-select--item').eq(index);
            if ($itemElement.length === 0) {
              $itemElement = $('<div/>').addClass('ui-virtual-select--item').appendTo(_this.dom.$canvas);
            }
            // TODO Optimize?
            $itemElement.data('item', item).data('index', firstRenderedItemIndex + index);
          });

          // remove excess dom elements
          _this.dom.$canvas.children('.ui-virtual-select--item').slice(items.length).remove();

          // update text
          _this.dom.$canvas.children('.ui-virtual-select--item').each(function () {
            var $itemElement = $(this);
            var item = $itemElement.data('item');
            var displayText = self.options.dataProvider.displayText(item, state.extendedModeEnabled);
            if ($itemElement.text() !== displayText) {
              $itemElement.text(displayText).attr('title', displayText);
            }
          });
        })();
      }

      // change active class
      this.dom.$canvas.children('.ui-virtual-select--item').each(function () {
        var $itemElement = $(this);
        if ($itemElement.data('index') === state.activeItemIndex && !$itemElement.hasClass('active')) {
          $itemElement.addClass('active');
        }
        if ($itemElement.data('index') !== state.activeItemIndex && $itemElement.hasClass('active')) {
          $itemElement.removeClass('active');
        }
      });

      // update state with rendered one
      this.renderedState = $.extend({}, state);
      return this.renderedState;
    };

    function initDOM($element) {
      var $container = $('<div/>').addClass('ui-virtual-select');
      $element.empty().append($container);

      var $searchInput = $('<input type="text"/>').addClass('ui-virtual-select--search-input');
      var $loadingIndicator = $('<div/>').addClass('ui-virtual-select--loading-indicator').text('Loading...').hide();
      var $items = $('<div/>').addClass('ui-virtual-select--items').css('overflow-y', 'scroll').hide();
      $container.append($searchInput, $loadingIndicator, $items);

      var $canvas = $('<div/>').addClass('ui-virtual-select--canvas');
      $items.append($canvas);

      return {
        $element: $element,
        $searchInput: $searchInput,
        $container: $container,
        $loadingIndicator: $loadingIndicator,
        $items: $items,
        $canvas: $canvas
      };
    }

    function startSelection(state) {
      var selectedItemIndex = indexOfItem(state.selectedItem);
      return $.extend(state, {
        open: true,
        activeItemIndex: selectedItemIndex >= 0 ? selectedItemIndex : 0,
        selectedItemIndex: selectedItemIndex
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
      var targetState = cancel(state);
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

      function noop() {}

      function onlyAfterClickOutside(callback) {
        return function () {
          return _state.clickedOutsideElement ? callback() : noop();
        };
      }

      function onlyIfMousePositionChanged(callback) {
        return function (event) {
          // workaround to prevent scripted scrolling from triggering mousemove events
          var _state2 = _state;
          var previousX = _state2.lastMouseX;
          var previousY = _state2.lastMouseY;
          var currentX = event.pageX;
          var currentY = event.pageY;

          return currentX !== previousX || currentY !== previousY ? callback(event) : noop();
        };
      }

      $(document).on('mousedown', function (event) {
        _state.clickedOutsideElement = !$.contains(element[0], event.target);
      });

      dom.$searchInput.on('focus', function () {
        loadItems(_state, options).then(function () {
          var targetState = startSelection(_state);
          renderer.render(targetState);
        });
        renderer.render(_state);
      }).on('keydown', function (event) {
        var key = event.which;
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
      }).on('blur', onlyAfterClickOutside(function () {
        var targetState = cancel(_state, options);
        renderer.render(targetState);
      })).on('keyup', function (event) {
        var query = $(event.target).val();
        var targetState = changeQuery(_state, query);
        renderer.render(targetState);
      });

      dom.$items.on('scroll', _.throttle(function () {
        renderer.render();
      }, 10));

      dom.$canvas.on('mousemove', _.throttle(function (event) {
        _state.lastMouseX = event.pageX;
        _state.lastMouseY = event.pageY;
      }, 50)).on('mousemove', '.ui-virtual-select--item', onlyIfMousePositionChanged(function (event) {
        var activeItemIndex = $(event.currentTarget).data('index');
        if (activeItemIndex !== _state.activeItemIndex) {
          _state.activeItemIndex = activeItemIndex;
          renderer.render(_state);
        }
      })).on('click', '.ui-virtual-select--item', function (event) {
        var targetState = cancel(_state);
        targetState.selectedItemIndex = $(event.currentTarget).data('index'); // TODO probably needs adjustmnts for jquery event filtering
        renderer.render(targetState);
      });
    }

    var _dom = initDOM(element, options);
    var _renderer = new Renderer(_dom, _options);

    initDOMEventHandlers(_dom, _state, _options, _renderer);

    function changeState(state) {
      _state = $.extend({}, state);
      _renderer.render(_state);
    }

    changeState(_state);
  }

  $.fn[pluginName] = function (options) {
    return this.each(function () {
      if (!$.data(this, 'plugin_' + pluginName)) {
        $.data(this, 'plugin_' + pluginName, new Plugin2($(this), options));
      }
    });
  };
})(jQuery, document);
//# sourceMappingURL=virtual-select.jquery.js.map
