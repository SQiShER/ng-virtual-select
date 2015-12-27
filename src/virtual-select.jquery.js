(function($, document) {
  const pluginName = `virtualselect`;
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

  function Plugin2(element, options) {

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

    function Renderer(dom, options) {
      this.dom = dom;
      this.options = options;
      this.renderedState = {};
    }

    Renderer.prototype.render = function(state) {
      const self = this;

      if (arguments.length === 0) {
        // re-render
        state = this.renderedState;
      }

      // update search input placeholder
      if (state.itemsLoaded && state.selectedItemIndex !== this.renderedState.selectedItemIndex) {
        const selectedItem = this.options.dataProvider.availableItems[state.selectedItemIndex];
        const displayText = selectedItem ?
          this.options.dataProvider.displayText(selectedItem) :
          this.options.dataProvider.noSelectionText();
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

        // okay, i know this is not the best place for this, but I currently don't know where else to put it
        if (state.query && state.query !== this.renderedState.query) {
          this.options.dataProvider.filter(state.query);
        }

        // adjust first item
        const scrollPosition = this.dom.$items.scrollTop();
        const firstRenderedItemIndex = Math.max(Math.floor(scrollPosition / this.options.itemHeight) - this.options.maxVisibleItems, 0);

        // adjust scroll position
        if (state.activeItemIndex !== this.renderedState.activeItemIndex) {
          const canvasSize = Math.min(this.options.dataProvider.items.length, this.options.maxVisibleItems) * this.options.itemHeight;
          const targetScrollPosition = state.activeItemIndex * this.options.itemHeight;
          const a1 = Math.ceil(scrollPosition / this.options.itemHeight) * this.options.itemHeight;
          const a2 = Math.floor(scrollPosition / this.options.itemHeight) * this.options.itemHeight + canvasSize;
          if (targetScrollPosition <= a1) {
            this.dom.$items.scrollTop(targetScrollPosition);
          } else if (targetScrollPosition >= a2) {
            this.dom.$items.scrollTop(targetScrollPosition - canvasSize + this.options.itemHeight);
          }
        }

        const items = this.options.dataProvider.get(firstRenderedItemIndex, firstRenderedItemIndex + this.options.maxRenderedItems);

        // update items height
        const itemsElementHeight = Math.min(this.options.maxVisibleItems, this.options.dataProvider.items.length) * this.options.itemHeight;
        this.dom.$items.css({
          height: `${itemsElementHeight}px`
        });

        // update canvas size
        const firstVisibleItemIndex = Math.max(Math.floor(this.dom.$items.scrollTop() / this.options.itemHeight) - this.options.maxVisibleItems, 0);
        const canvasElementMarginTop = firstVisibleItemIndex * this.options.itemHeight;
        const canvasElementHeight = this.options.dataProvider.items.length * this.options.itemHeight - firstVisibleItemIndex * this.options.itemHeight;
        this.dom.$canvas.css({
          'height': `${canvasElementHeight}px`,
          'margin-top': `${canvasElementMarginTop}px`
        });

        // create dom elements if necessary
        items.forEach((item, index) => {
          let $itemElement = this.dom.$canvas.children('.ui-virtual-select--item').eq(index);
          if ($itemElement.length === 0) {
            $itemElement = $('<div/>').addClass('ui-virtual-select--item').appendTo(this.dom.$canvas);
          }
          // TODO Optimize?
          $itemElement.data('item', item).data('index', firstRenderedItemIndex + index);
        });

        // remove excess dom elements
        this.dom.$canvas.children('.ui-virtual-select--item').slice(items.length).remove();

        // update text
        this.dom.$canvas.children('.ui-virtual-select--item').each(function() {
          const $itemElement = $(this);
          const item = $itemElement.data('item');
          const displayText = self.options.dataProvider.displayText(item, state.extendedModeEnabled);
          if ($itemElement.text() !== displayText) {
            $itemElement.text(displayText).attr('title', displayText);
          }
        });
      }

      // change active class
      this.dom.$canvas.children('.ui-virtual-select--item').each(function() {
        const $itemElement = $(this);
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

  $.fn[pluginName] = function(options) {
    return this.each(function() {
      if (!$.data(this, `plugin_${pluginName}`)) {
        $.data(this, `plugin_${pluginName}`, new Plugin2($(this), options));
      }
    });
  };

})(jQuery, document);
