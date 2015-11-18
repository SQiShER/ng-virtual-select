'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

angular.module('uiVirtualSelect', []).directive('uiVirtualSelect', ['$timeout', '$document', '$q', function ($timeout, $document, $q) {

  var Keys = {
    ArrowUp: 38,
    ArrowDown: 40,
    Enter: 13,
    Escape: 27
  };

  function controllerFn() {
    var _this = this;

    this.formatSearchInput = function (item) {
      if (item) {
        return _this.optionsProvider.displayText(item);
      } else {
        if (_this.optionsProvider.noSelectionText) {
          return _this.optionsProvider.noSelectionText();
        } else {
          return '';
        }
      }
    };
  }

  function linkFn(scope, elem, attrs, _ref, $transclude) {
    var _ref2 = _slicedToArray(_ref, 2);

    var uiVirtualSelectController = _ref2[0];
    var ngModelController = _ref2[1];

    var $select = elem.find('.ui-virtual-select');
    var $searchInput = elem.find('.ui-virtual-select--search-input');
    var $canvas = elem.find('.ui-virtual-select--canvas');
    var $loadingIndicator = elem.find('.ui-virtual-select--loading-indicator').hide();
    var $items = elem.find('.ui-virtual-select--items').css('overflow-y', 'scroll').hide();
    var options = {
      itemHeight: detectItemHeight(),
      itemsVisible: 10,
      itemsRendered: 30
    };
    var lastKnownMousePosition = {
      x: 0,
      y: 0
    };
    var scrollTop = 0;
    var previousSearch = '';
    var clickedOutsideElement = true;
    var activeItemIndex = 0;
    var _itemModels = [];
    var extendedModeEnabled = false;
    var forceRender = false;

    var ItemModel = function ItemModel(value, index) {
      _classCallCheck(this, ItemModel);

      this.index = index;
      this.value = value;
    };

    var LoadingIndicator = (function () {
      function LoadingIndicator($loadingIndicator, $select, $template) {
        _classCallCheck(this, LoadingIndicator);

        this.$loadingIndicator = $loadingIndicator;
        this.$select = $select;
        this.loadingClassName = 'loading';
        if ($template.length) {
          $loadingIndicator.empty().append($template);
        }
      }

      _createClass(LoadingIndicator, [{
        key: 'enable',
        value: function enable() {
          this.$loadingIndicator.show();
          this.$select.addClass(this.loadingClassName);
        }
      }, {
        key: 'disable',
        value: function disable() {
          this.$loadingIndicator.hide();
          this.$select.removeClass(this.loadingClassName);
        }
      }]);

      return LoadingIndicator;
    })();

    var loadingIndicator = new LoadingIndicator($loadingIndicator, $select, $transclude().siblings('nvs-loading-indicator').eq(0));

    var loaded = false;

    function doLoad() {
      if (loaded) {
        return $q.when();
      } else {
        loadingIndicator.enable();
        return uiVirtualSelectController.optionsProvider.load().then(function () {
          loaded = true;
          loadingIndicator.disable();
          uiVirtualSelectController.onLoadedCallback();
        });
      }
    }

    $searchInput.on('focus', function () {
      doLoad().then(function () {
        updateView();
        open();
        scope.$evalAsync(adjustScrollPosition);
      });

      $searchInput.on('blur', function () {
        if (clickedOutsideElement) {
          clearSearchInput(true);
          close();
        }
        $searchInput.off('keydown keyup blur');
        $document.off('mousedown');
      });

      $searchInput.on('keyup', function (event) {
        var search = $(event.target).val();
        if (search !== previousSearch) {
          uiVirtualSelectController.optionsProvider.filter(search);
          previousSearch = search;
          activeItemIndex = 0;
          updateView();
          scrollTo(0);
        }
      });

      $searchInput.on('keydown', function (event) {
        switch (event.which) {
          case Keys.ArrowUp:
            return activatePreviousItem();
          case Keys.ArrowDown:
            return activateNextItem();
          case Keys.Enter:
            return selectActiveItem();
          case Keys.Escape:
            return cancel();
          case 17:
            extendedModeEnabled = !extendedModeEnabled;
            forceRender = true;
            updateView();
            break;
          default:
            clickedOutsideElement = true;
        }
      });

      $document.on('mousedown', function (event) {
        clickedOutsideElement = !$.contains(elem[0], event.target);
      });
    });

    $items.on('scroll', _.throttle(function () {
      scrollTop = $items.scrollTop();
      updateView();
    }, 10));

    $canvas.on('mousemove', _.throttle(function (event) {
      lastKnownMousePosition.x = event.pageX;
      lastKnownMousePosition.y = event.pageY;
    }, 50));

    function detectItemHeight() {
      var $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
      var height = $sampleItem.outerHeight();
      $sampleItem.remove();
      return height;
    }

    function activatePreviousItem() {
      var itemHeight = options.itemHeight;

      var firstVisibleItem = Math.ceil((scrollTop + itemHeight) / itemHeight) - 1;
      if (activeItemIndex > 0) {
        activeItemIndex--;
        updateView();
        if (activeItemIndex < firstVisibleItem) {
          scrollTo(Math.ceil(scrollTop / itemHeight) - 1);
        }
      }
    }

    function activateNextItem() {
      var itemHeight = options.itemHeight;
      var itemsVisible = options.itemsVisible;

      var lastVisibleItem = Math.floor((scrollTop + itemHeight) / itemHeight) + itemsVisible - 1;
      if (activeItemIndex < uiVirtualSelectController.optionsProvider.size() - 1) {
        activeItemIndex++;
        updateView();
        if (activeItemIndex >= lastVisibleItem) {
          scrollTo(Math.floor(scrollTop / itemHeight) + 1);
        }
      }
    }

    function selectActiveItem() {
      selectItem(activeItemIndex);
    }

    function cancel() {
      clearSearchInput();
      close();
      activeItemIndex = 0;
    }

    function scrollTo(index) {
      var itemHeight = options.itemHeight;

      scrollTop = Math.max(0, index) * itemHeight;
      $items.scrollTop(scrollTop);
    }

    function clearSearchInput(omitBlur) {
      uiVirtualSelectController.optionsProvider.filter('');
      $searchInput.val('');
      if (!omitBlur) {
        $searchInput.trigger('blur');
      }
    }

    function indexOfItem(itemToFind) {
      var _uiVirtualSelectContr = uiVirtualSelectController.optionsProvider;
      var items = _uiVirtualSelectContr.items;
      var identity = _uiVirtualSelectContr.identity;

      return _.findIndex(items, function (item) {
        return identity(item) === identity(itemToFind);
      });
    }

    function updateItemElements() {
      var $itemSet = $canvas.children('.ui-virtual-select--item');
      var $activeItem = $itemSet.filter('.active');
      _itemModels.forEach(function (itemModel, index) {
        var $itemElement = $canvas.children('.ui-virtual-select--item').eq(index);
        if ($itemElement.length === 0) {
          $itemElement = $(document.createElement('div')).addClass('ui-virtual-select--item').appendTo($canvas).on('mousemove', function (event) {
            var previousX = lastKnownMousePosition.x;
            var previousY = lastKnownMousePosition.y;
            var currentX = event.pageX;
            var currentY = event.pageY;
            // workaround to prevent scripted scrolling from triggering mousemove events

            if (currentX !== previousX || currentY !== previousY) {
              activeItemIndex = $(event.currentTarget).data('index');
              updateItemElements();
            }
          }).on('click', function (event) {
            selectItem($(event.currentTarget).data('index'));
          });
        }
        var _uiVirtualSelectContr2 = uiVirtualSelectController.optionsProvider;
        var identityFn = _uiVirtualSelectContr2.identity;
        var displayTextFn = _uiVirtualSelectContr2.displayText;
        var item = itemModel.value;
        var itemIndex = itemModel.index;

        var itemIdentity = identityFn(item);
        if (itemIdentity !== $itemElement.data('identity') || forceRender) {
          var displayText = displayTextFn(item, extendedModeEnabled);
          $itemElement.data('identity', itemIdentity).data('index', itemIndex).data('item', item).attr('title', displayText).text(displayText);
        }
        if (itemIndex === activeItemIndex && !$itemElement.hasClass('active')) {
          $activeItem.removeClass('active');
          $itemElement.addClass('active');
        }
      });

      // remove unused elements
      $canvas.children('.ui-virtual-select--item').slice(_itemModels.length).remove();

      forceRender = false;
    }

    function selectItem(index) {
      var itemModel = _.find(_itemModels, function (itemModel) {
        return itemModel.index === index;
      });
      var item = itemModel.value;
      scope.$apply(function () {
        ngModelController.$setViewValue(item);
        uiVirtualSelectController.selectedItem = item;
        uiVirtualSelectController.onSelectCallback({
          selection: item
        });
      });
      clearSearchInput();
      close();
    }

    function updateView() {
      updateItemModels();
      updateItemElements();
      updateItemsElementSize();
      updateCanvasElementSize();
    }

    function updateItemModels() {
      var itemHeight = options.itemHeight;
      var itemsVisible = options.itemsVisible;
      var itemsRendered = options.itemsRendered;

      var firstItem = Math.max(Math.floor(scrollTop / itemHeight) - itemsVisible, 0);
      var items = uiVirtualSelectController.optionsProvider.get(firstItem, firstItem + itemsRendered);
      _itemModels = items.map(function (value, index) {
        return new ItemModel(value, firstItem + index);
      });
    }

    function updateItemsElementSize() {
      var itemHeight = options.itemHeight;
      var itemsVisible = options.itemsVisible;

      var totalItemCount = uiVirtualSelectController.optionsProvider.size();
      var itemsElementHeight = Math.min(itemsVisible, totalItemCount) * itemHeight;
      $items.css({
        'height': itemsElementHeight + 'px'
      });
    }

    function updateCanvasElementSize() {
      var itemHeight = options.itemHeight;
      var itemsVisible = options.itemsVisible;

      var firstItem = Math.max(Math.floor(scrollTop / itemHeight) - itemsVisible, 0);
      var totalItemCount = uiVirtualSelectController.optionsProvider.size();
      var canvasElementMarginTop = firstItem * itemHeight;
      var canvasElementHeight = totalItemCount * itemHeight - firstItem * itemHeight;
      $canvas.css({
        'height': canvasElementHeight + 'px',
        'margin-top': canvasElementMarginTop + 'px'
      });
    }

    scope.$on('ui-virtual-select:focus', function () {
      $searchInput.focus();
    });

    scope.$on('ui-virtual-select:load', function () {
      doLoad();
    });

    function adjustScrollPosition() {
      var scrollIndex = 0;
      if (uiVirtualSelectController.selectedItem) {
        scrollIndex = indexOfItem(uiVirtualSelectController.selectedItem);
      }
      activeItemIndex = scrollIndex;
      updateView();
      scrollTo(scrollIndex);
    }

    function close() {
      $items.hide();
      $select.removeClass('open');
      uiVirtualSelectController.onCloseCallback();
    }

    function open() {
      $items.show();
      $select.addClass('open');
    }

    ngModelController.$render = function () {
      uiVirtualSelectController.selectedItem = ngModelController.$viewValue;
    };
  }

  return {
    restrict: 'E',
    require: ['uiVirtualSelect', 'ngModel'],
    templateUrl: 'ui-virtual-select.tpl.html',
    controller: controllerFn,
    controllerAs: 'select',
    transclude: true,
    link: linkFn,
    bindToController: true,
    scope: {
      optionsProvider: '=?uiOptionsProvider',
      onSelectCallback: '&uiOnSelect',
      onCloseCallback: '&uiOnClose',
      onLoadedCallback: '&uiOnLoaded'
    }
  };
}]);

angular.module("uiVirtualSelect").run(["$templateCache", function ($templateCache) {
  $templateCache.put("ui-virtual-select.tpl.html", "<div class=\"ui-virtual-select\">\n	<input type=\"text\" class=\"ui-virtual-select--search-input\" placeholder=\"{{ select.formatSearchInput(select.selectedItem) }}\" />\n	<div class=\"ui-virtual-select--loading-indicator\">\n		Loading...\n	</div>\n	<div class=\"ui-virtual-select--items\">\n		<div class=\"ui-virtual-select--canvas\"></div>\n	</div>\n</div>");
}]);
//# sourceMappingURL=ui-virtual-select.js.map
