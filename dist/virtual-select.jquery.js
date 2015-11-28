'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

(function ($) {
  var pluginName = 'virtualselect';
  var defaults = {};
  var Keys = {
    ArrowUp: 38,
    ArrowDown: 40,
    Enter: 13,
    Escape: 27,
    Control: 17
  };

  var ItemModel = function ItemModel(value, index) {
    _classCallCheck(this, ItemModel);

    this.index = index;
    this.value = value;
  };

  var Plugin = (function () {
    function Plugin(element, options) {
      _classCallCheck(this, Plugin);

      this.$element = $(element);
      this.options = $.extend({}, defaults, options);
      this.scrollTop = 0;
      this.activeItemIndex = 0;
      this.clickedOutsideElement = true;
      this.selectedItem = this.options.selectedItem || null;
      this.previousSearch = '';
      this.itemsLoaded = false;
      var itemHeight = this.options.itemHeight > 0 ? this.options.itemHeight : this.detectItemHeight();
      this.itemOptions = {
        height: itemHeight,
        maxVisible: 10,
        maxRendered: 30
      };
      this.lastKnownMousePosition = {
        x: 0,
        y: 0
      };
      this.init();
    }

    _createClass(Plugin, [{
      key: 'detectItemHeight',
      value: function detectItemHeight() {
        var $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
        var height = $sampleItem.outerHeight();
        $sampleItem.remove();
        return height;
      }
    }, {
      key: 'init',
      value: function init() {
        var _this = this;

        this.$document = $(document);
        this.$container = $('<div/>').addClass('ui-virtual-select');
        this.$searchInput = $('<input type="text"/>').addClass('ui-virtual-select--search-input').attr('placeholder', 'TODO');
        this.$loadingIndicator = $('<div/>').addClass('ui-virtual-select--loading-indicator').text('Loading...').hide();
        this.$items = $('<div/>').addClass('ui-virtual-select--items').css('overflow-y', 'scroll').hide();
        this.$canvas = $('<div/>').addClass('ui-virtual-select--canvas');
        this.$container.append(this.$searchInput, this.$loadingIndicator, this.$items);
        this.$items.append(this.$canvas);
        this.$element.empty();
        this.$element.append(this.$container);
        this.updateSearchInputPlaceholder();
        this.$searchInput.on('focus', function () {
          _this.loadItems().then(function () {
            _this.updateItems();
            _this.showItems();
            _this.adjustScrollPosition();
          });
          _this.$searchInput.on('blur', function () {
            if (_this.clickedOutsideElement) {
              _this.clearSearchInput(true);
              _this.hideItems();
            }
            _this.$searchInput.off('keydown keyup blur');
            _this.$document.off('mousedown');
          });
          _this.$searchInput.on('keyup', function (event) {
            var search = $(event.target).val();
            if (search !== _this.previousSearch) {
              _this.options.dataProvider.filter(search);
              _this.previousSearch = search;
              _this.activeItemIndex = 0;
              _this.updateItems();
              _this.scrollTo(0);
            }
          });
          _this.$searchInput.on('keydown', function (event) {
            switch (event.which) {
              case Keys.ArrowUp:
                return _this.activatePreviousItem();
              case Keys.ArrowDown:
                return _this.activateNextItem();
              case Keys.Enter:
                return _this.selectActiveItem();
              case Keys.Escape:
                return _this.cancel();
              case Keys.Control:
                _this.extendedModeEnabled = !_this.extendedModeEnabled;
                _this.forceRender = true;
                _this.updateItems();
                break;
              default:
                _this.clickedOutsideElement = true;
            }
          });
          _this.$document.on('mousedown', function (event) {
            _this.clickedOutsideElement = !$.contains(_this.$element[0], event.target);
          });
        });
        this.$items.on('scroll', _.throttle(function () {
          _this.scrollTop = _this.$items.scrollTop();
          _this.updateItems();
        }, 10));
        this.$canvas.on('mousemove', _.throttle(function (event) {
          _this.lastKnownMousePosition.x = event.pageX;
          _this.lastKnownMousePosition.y = event.pageY;
        }, 50));
      }
    }, {
      key: 'enableLoadingIndicator',
      value: function enableLoadingIndicator() {
        this.$loadingIndicator.show();
        this.$container.addClass('loading');
      }
    }, {
      key: 'disableLoadingIndicator',
      value: function disableLoadingIndicator() {
        this.$loadingIndicator.hide();
        this.$container.removeClass('loading');
      }
    }, {
      key: 'loadItems',
      value: function loadItems() {
        var _this2 = this;

        if (this.itemsLoaded) {
          return Promise.resolve();
        } else {
          this.enableLoadingIndicator();
          return this.options.dataProvider.load().then(function () {
            _this2.itemsLoaded = true;
            _this2.disableLoadingIndicator();
          });
        }
      }
    }, {
      key: 'updateItems',
      value: function updateItems() {
        this.updateItemModels();
        this.updateItemElements();
        this.updateItemsElementSize();
        this.updateCanvasElementSize();
      }
    }, {
      key: 'updateItemModels',
      value: function updateItemModels() {
        var _itemOptions = this.itemOptions;
        var itemHeight = _itemOptions.height;
        var maxVisible = _itemOptions.maxVisible;
        var maxRendered = _itemOptions.maxRendered;

        var firstItem = Math.max(Math.floor(this.scrollTop / itemHeight) - maxVisible, 0);
        var items = this.options.dataProvider.get(firstItem, firstItem + maxRendered);
        this.itemModels = items.map(function (value, index) {
          return new ItemModel(value, firstItem + index);
        });
      }
    }, {
      key: 'updateItemElements',
      value: function updateItemElements() {
        var _this3 = this;

        var $itemSet = this.$canvas.children('.ui-virtual-select--item');
        var $activeItem = $itemSet.filter('.active');
        this.itemModels.forEach(function (itemModel, index) {
          var $itemElement = _this3.$canvas.children('.ui-virtual-select--item').eq(index);
          if ($itemElement.length === 0) {
            $itemElement = $(document.createElement('div')).addClass('ui-virtual-select--item').appendTo(_this3.$canvas).on('mousemove', function (event) {
              var _lastKnownMousePositi = _this3.lastKnownMousePosition;
              var previousX = _lastKnownMousePositi.x;
              var previousY = _lastKnownMousePositi.y;
              var currentX = event.pageX;
              var currentY = event.pageY;
              // workaround to prevent scripted scrolling from triggering mousemove events

              if (currentX !== previousX || currentY !== previousY) {
                _this3.activeItemIndex = $(event.currentTarget).data('index');
                _this3.updateItemElements();
              }
            }).on('click', function (event) {
              _this3.selectItem($(event.currentTarget).data('index'));
            });
          }
          var _options$dataProvider = _this3.options.dataProvider;
          var identityFn = _options$dataProvider.identity;
          var displayTextFn = _options$dataProvider.displayText;
          var item = itemModel.value;
          var itemIndex = itemModel.index;

          var itemIdentity = identityFn(item);
          if (itemIdentity !== $itemElement.data('identity') || _this3.forceRender) {
            var displayText = displayTextFn(item, _this3.extendedModeEnabled);
            $itemElement.data('identity', itemIdentity).data('index', itemIndex).data('item', item).attr('title', displayText).text(displayText);
          }
          if (itemIndex === _this3.activeItemIndex && !$itemElement.hasClass('active')) {
            $activeItem.removeClass('active');
            $itemElement.addClass('active');
          }
        });

        // remove unused elements
        this.$canvas.children('.ui-virtual-select--item').slice(this.itemModels.length).remove();

        this.forceRender = false;
      }
    }, {
      key: 'updateItemsElementSize',
      value: function updateItemsElementSize() {
        var _itemOptions2 = this.itemOptions;
        var itemHeight = _itemOptions2.height;
        var itemsVisible = _itemOptions2.maxVisible;

        var itemsElementHeight = Math.min(itemsVisible, this.totalItemCount) * itemHeight;
        this.$items.css({
          'height': itemsElementHeight + 'px'
        });
      }
    }, {
      key: 'updateCanvasElementSize',
      value: function updateCanvasElementSize() {
        var _itemOptions3 = this.itemOptions;
        var itemHeight = _itemOptions3.height;
        var itemsVisible = _itemOptions3.maxVisible;

        var firstItem = Math.max(Math.floor(this.scrollTop / itemHeight) - itemsVisible, 0);
        var canvasElementMarginTop = firstItem * itemHeight;
        var canvasElementHeight = this.totalItemCount * itemHeight - firstItem * itemHeight;
        this.$canvas.css({
          'height': canvasElementHeight + 'px',
          'margin-top': canvasElementMarginTop + 'px'
        });
      }
    }, {
      key: 'updateSearchInputPlaceholder',
      value: function updateSearchInputPlaceholder() {
        var selectedItem = this.selectedItem;

        var displayText = undefined;
        if (selectedItem) {
          displayText = this.options.dataProvider.displayText(selectedItem);
        } else {
          displayText = this.options.dataProvider.noSelectionText();
        }
        this.$searchInput.attr('placeholder', displayText);
      }
    }, {
      key: 'showItems',
      value: function showItems() {
        this.$items.show();
        this.$container.addClass('open');
      }
    }, {
      key: 'hideItems',
      value: function hideItems() {
        this.$items.hide();
        this.$container.removeClass('open');
      }
    }, {
      key: 'selectItem',
      value: function selectItem(index) {
        var itemModel = _.find(this.itemModels, function (itemModel) {
          return itemModel.index === index;
        });
        var item = itemModel.value;
        this.selectedItem = item;
        if (this.options.dataProvider.onSelect) {
          this.options.dataProvider.onSelect(item, index);
        }
        this.updateSearchInputPlaceholder();
        this.clearSearchInput();
        this.hideItems();
      }
    }, {
      key: 'adjustScrollPosition',
      value: function adjustScrollPosition() {
        var scrollIndex = 0;
        if (this.selectedItem) {
          scrollIndex = this.indexOfItem(this.selectedItem);
        }
        this.activeItemIndex = scrollIndex;
        this.updateItems();
        this.scrollTo(scrollIndex);
      }
    }, {
      key: 'indexOfItem',
      value: function indexOfItem(itemToFind) {
        var _options$dataProvider2 = this.options.dataProvider;
        var items = _options$dataProvider2.items;
        var identity = _options$dataProvider2.identity;

        return _.findIndex(items, function (item) {
          return identity(item) === identity(itemToFind);
        });
      }
    }, {
      key: 'activatePreviousItem',
      value: function activatePreviousItem() {
        var itemHeight = this.itemOptions.height;

        var firstVisibleItem = Math.ceil((this.scrollTop + itemHeight) / itemHeight) - 1;
        if (this.activeItemIndex > 0) {
          this.activeItemIndex--;
          this.updateItems();
          if (this.activeItemIndex < firstVisibleItem) {
            this.scrollTo(Math.ceil(this.scrollTop / itemHeight) - 1);
          }
        }
      }
    }, {
      key: 'activateNextItem',
      value: function activateNextItem() {
        var _itemOptions4 = this.itemOptions;
        var itemHeight = _itemOptions4.height;
        var maxVisible = _itemOptions4.maxVisible;

        var lastVisibleItem = Math.floor((this.scrollTop + itemHeight) / itemHeight) + maxVisible - 1;
        if (this.activeItemIndex < this.totalItemCount - 1) {
          this.activeItemIndex++;
          this.updateItems();
          if (this.activeItemIndex >= lastVisibleItem) {
            this.scrollTo(Math.floor(this.scrollTop / itemHeight) + 1);
          }
        }
      }
    }, {
      key: 'selectActiveItem',
      value: function selectActiveItem() {
        this.selectItem(this.activeItemIndex);
      }
    }, {
      key: 'cancel',
      value: function cancel() {
        this.clearSearchInput();
        this.hideItems();
        this.activeItemIndex = 0;
      }
    }, {
      key: 'scrollTo',
      value: function scrollTo(index) {
        this.scrollTop = Math.max(0, index) * this.itemOptions.height;
        this.$items.scrollTop(this.scrollTop);
      }
    }, {
      key: 'clearSearchInput',
      value: function clearSearchInput(omitBlur) {
        this.options.dataProvider.filter('');
        this.$searchInput.val('');
        if (!omitBlur) {
          this.$searchInput.trigger('blur');
        }
      }
    }, {
      key: 'totalItemCount',
      get: function get() {
        var _options$dataProvider3 = this.options.dataProvider;
        var dataProvider = _options$dataProvider3 === undefined ? {} : _options$dataProvider3;
        var _dataProvider$items = dataProvider.items;
        var items = _dataProvider$items === undefined ? [] : _dataProvider$items;

        return items.length;
      }
    }]);

    return Plugin;
  })();

  $.fn[pluginName] = function (options) {
    return this.each(function () {
      if (!$.data(this, 'plugin_' + pluginName)) {
        $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
      }
    });
  };
})(jQuery);
//# sourceMappingURL=virtual-select.jquery.js.map
