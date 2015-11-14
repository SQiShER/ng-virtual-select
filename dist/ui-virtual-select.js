'use strict';

angular.module('uiVirtualSelect', [])

  .directive('uiVirtualSelect', ['$timeout', '$document', function($timeout, $document) {

    function controllerFn() {
      var self = this;
      self.items = [];
      self.search = '';
      self.isOpen = false;
      self.isLoading = false;
      self.formatSearchInput = function(item) {
        if (item) {
          return self.optionsProvider.displayText(item);
        } else {
          if (self.optionsProvider.noSelectionText) {
            return self.optionsProvider.noSelectionText();
          } else {
            return '';
          }
        }
      };
    }

    function linkFn(scope, elem, attrs, controllers, $transclude) {
      var uiVirtualSelectController = controllers[0];
      var ngModelController = controllers[1];

      function detectItemHeight() {
        var $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
        var height = $sampleItem.outerHeight();
        $sampleItem.remove();
        return height;
      }

      var Keys = {
        ArrowUp: 38,
        ArrowDown: 40,
        Enter: 13,
        Escape: 27
      };

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

      var $select = elem.find('.ui-virtual-select');
      var $searchInput = elem.find('.ui-virtual-select--search-input');
      var $items = elem.find('.ui-virtual-select--items').hide();
      // var $scrollContainer = elem.find('.ui-virtual-select--scroll-container');
      var $canvas = elem.find('.ui-virtual-select--canvas');
      var $loadingIndicator = elem.find('.ui-virtual-select--loading-indicator').hide();

      var loadingIndicatorTemplate = $transclude().siblings('nvs-loading-indicator')[0];
      if (loadingIndicatorTemplate) {
        $loadingIndicator.empty();
        $loadingIndicator.append(loadingIndicatorTemplate);
      }

      $searchInput.on('focus', searchInputFocusHandler);

      function searchInputFocusHandler() {
        $loadingIndicator.show();
        $select.addClass('loading');
        uiVirtualSelectController.optionsProvider.load().then(function() {
          $loadingIndicator.hide();
          $select.removeClass('loading');
          updateItemList();
          showItems();
          scope.$evalAsync(adjustScrollPosition);
        });
        $searchInput.on('blur', searchInputBlurHandler);
        $searchInput.on('keyup', searchInputKeyupHandler);
        $searchInput.on('keydown', searchInputKeydownHandler);
        $document.on('mousedown', documentMousedownHandler);
      }

      function searchInputBlurHandler() {
        if (clickedOutsideElement) {
          clearSearchInput(true);
          hideItems();
        }
        $searchInput.off('keydown', searchInputKeydownHandler);
        $searchInput.off('keyup', searchInputKeyupHandler);
        $searchInput.off('blur', searchInputBlurHandler);
        $document.off('mousedown', documentMousedownHandler);
      }

      function activatePreviousItem() {
        var firstVisibleItem = Math.ceil((scrollTop + options.itemHeight) / options.itemHeight) - 1;
        if (activeItemIndex > 0) {
          activeItemIndex--;
          updateItemList();
          if (activeItemIndex < firstVisibleItem) {
            scrollTo(Math.ceil(scrollTop / options.itemHeight) - 1);
          }
        }
      }

      function activateNextItem() {
        var lastVisibleItem = Math.floor((scrollTop + options.itemHeight) / options.itemHeight) + options.itemsVisible -
          1;
        if (activeItemIndex < uiVirtualSelectController.optionsProvider.size() - 1) {
          activeItemIndex++;
          updateItemList();
          if (activeItemIndex >= lastVisibleItem) {
            scrollTo(Math.floor(scrollTop / options.itemHeight) + 1);
          }
        }
      }

      function selectActiveItem() {
        selectItem(activeItemIndex);
      }

      function cancel() {
        clearSearchInput();
        hideItems();
        activeItemIndex = 0;
      }

      function searchInputKeydownHandler(event) {
        switch (event.which) {
          case Keys.ArrowUp:
            return activatePreviousItem();
          case Keys.ArrowDown:
            return activateNextItem();
          case Keys.Enter:
            return selectActiveItem();
          case Keys.Escape:
            return cancel();
          default:
            clickedOutsideElement = true;
        }
      }

      function searchInputKeyupHandler(event) {
        var search = $(event.target).val();
        if (search !== previousSearch) {
          uiVirtualSelectController.optionsProvider.filter(search);
          previousSearch = search;
          activeItemIndex = 0;
          updateItemList();
          scrollTo(0);
        }
      }

      function documentMousedownHandler(event) {
        var targetBelongsToThisComponent = $.contains(elem[0], event.target);
        if (targetBelongsToThisComponent) {
          clickedOutsideElement = false;
        } else {
          clickedOutsideElement = true;
        }
      }

      function scrollTo(index) {
        scrollTop = Math.max(0, index) * options.itemHeight;
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
        var identity = uiVirtualSelectController.optionsProvider.identity(itemToFind);
        return _.findIndex(uiVirtualSelectController.optionsProvider.items, function(item) {
          return uiVirtualSelectController.optionsProvider.identity(item) === identity;
        });
      }

      function itemMouseMoveHandler(event) {
        // workaround to prevent scripted scrolling from triggering mousemove events
        if (event.pageX !== lastKnownMousePosition.x || event.pageY !== lastKnownMousePosition.y) {
          activeItemIndex = $(this).data('index');
          updateItemElements(uiVirtualSelectController.items);
        }
      }

      function updateItemElements(items) {
        var $itemSet = $canvas.children('.ui-virtual-select--item');
        var $currentlyActiveItem = $itemSet.filter('.active');
        _.each(items, function(item, index) {
          var itemElement = $canvas.children('.ui-virtual-select--item').eq(index);
          if (itemElement.length === 0) {
            itemElement = $(document.createElement('div')).addClass('ui-virtual-select--item');
            itemElement.appendTo($canvas);
            itemElement.on('mousemove', itemMouseMoveHandler);
            itemElement.on('click', function() {
              var itemIndex = $(this).data('index');
              selectItem(itemIndex);
            });
          }
          var itemIdentity = uiVirtualSelectController.optionsProvider.identity(item.value);
          if (itemIdentity !== itemElement.data('identity')) {
            itemElement.data('identity', itemIdentity);
            itemElement.data('index', item.index);
            itemElement.data('item', item.value);
            itemElement.text(uiVirtualSelectController.optionsProvider.displayText(item.value));
          }
          if (item.index === activeItemIndex && !itemElement.hasClass('active')) {
            $currentlyActiveItem.removeClass('active');
            itemElement.addClass('active');
          }
        });

        // remove unused elements
        $canvas.children('.ui-virtual-select--item').slice(items.length).remove();
      }

      function selectItem(index) {
        var itemModel = _.find(uiVirtualSelectController.items, {
          index: index
        });
        var item = itemModel.value;
        ngModelController.$setViewValue(item);
        uiVirtualSelectController.selectedItem = item;
        uiVirtualSelectController.onSelectCallback({
          selection: item
        });
        clearSearchInput();
        hideItems();
      }

      function updateItemList() {
        var itemHeight = options.itemHeight,
          optionsProvider = uiVirtualSelectController.optionsProvider,
          firstItem = Math.max(Math.floor(scrollTop / itemHeight) - options.itemsVisible, 0),
          lastItem = firstItem + options.itemsRendered,
          itemsToRender = optionsProvider.get(firstItem, lastItem),
          totalItemCount = optionsProvider.size();
        uiVirtualSelectController.items = _.map(itemsToRender, function(value, index) {
          return {
            index: firstItem + index,
            value: value
          };
        });
        updateItemElements(uiVirtualSelectController.items);
        $items.css({
          'height': (Math.min(options.itemsVisible, totalItemCount) * itemHeight) + 'px',
          'overflow-y': 'scroll'
        });
        var distanceFromTop = firstItem * itemHeight;
        var heightOfAllItems = totalItemCount * itemHeight;
        $canvas.css({
          'height': (heightOfAllItems - distanceFromTop) + 'px',
          'margin-top': distanceFromTop + 'px'
        });
      }

      $items.on('scroll', _.throttle(function itemsScrollHandler() {
        scrollTop = $items.scrollTop();
        updateItemList();
      }, 10));

      $canvas.on('mousemove', _.throttle(function canvasMouseMoveHandler(event) {
        lastKnownMousePosition.x = event.pageX;
        lastKnownMousePosition.y = event.pageY;
      }, 50));

      scope.$on('ui-virtual-select:focus', function() {
        $searchInput.focus();
      });

      function adjustScrollPosition() {
        var scrollIndex = 0;
        if (uiVirtualSelectController.selectedItem) {
          scrollIndex = indexOfItem(uiVirtualSelectController.selectedItem);
        }
        activeItemIndex = scrollIndex;
        updateItemList();
        scrollTo(scrollIndex);
      }

      function hideItems() {
        $items.hide();
        scope.$evalAsync(function() {
          uiVirtualSelectController.isOpen = false;
        });
        uiVirtualSelectController.onCloseCallback();
      }

      function showItems() {
        $items.show();
        scope.$evalAsync(function() {
          uiVirtualSelectController.isOpen = true;
        });
      }

      ngModelController.$render = function() {
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
        onCloseCallback: '&uiOnClose'
      }
    };
  }]);

angular.module("uiVirtualSelect").run(["$templateCache", function($templateCache) {$templateCache.put("ui-virtual-select.tpl.html","<div class=\"ui-virtual-select\" ng-class=\"{open: select.isOpen}\">\n  <input type=\"text\" class=\"ui-virtual-select--search-input\" placeholder=\"{{ select.formatSearchInput(select.selectedItem) }}\" />\n  <div class=\"ui-virtual-select--loading-indicator\">\n    Loading...\n  </div>\n  <div class=\"ui-virtual-select--items\">\n    <div class=\"ui-virtual-select--canvas\"></div>\n  </div>\n</div>");}]);
//# sourceMappingURL=ui-virtual-select.js.map
