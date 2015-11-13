'use strict';

angular.module('uiVirtualSelect', [])

  .directive('uiVirtualSelect', ['$timeout', '$document', function($timeout, $document) {
    return {
      restrict: 'E',
      require: ['uiVirtualSelect', 'ngModel'],
      templateUrl: 'ui-virtual-select.tpl.html',
      controller: function() {
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
      },
      controllerAs: 'select',
      transclude: true,
      compile: function() {
        return function(scope, elem, attrs, controllers, $transclude) {
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
          var closeOnBlur = true;
          var activeItemIndex = 0;

          // var $select = elem.find('.ui-virtual-select');
          var $searchInput = elem.find('.ui-virtual-select--search-input');
          var $items = elem.find('.ui-virtual-select--items');
          var $canvas = elem.find('.ui-virtual-select--canvas');
          var $loadingIndicator = elem.find('.ui-virtual-select--loading-indicator');

          $items.hide();

          var loadingIndicatorTemplate = $transclude().siblings('nvs-loading-indicator')[0];
          if (loadingIndicatorTemplate) {
            $loadingIndicator.empty();
            $loadingIndicator.append(loadingIndicatorTemplate);
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
            var lastVisibleItem = Math.floor((scrollTop + options.itemHeight) / options.itemHeight) + options.itemsVisible - 1;
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
                closeOnBlur = true;
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

          function searchInputBlurHandler() {
            if (closeOnBlur) {
              clearSearchInput(true);
              hideItems();
            }
            $searchInput.off('keydown', searchInputKeydownHandler);
            $searchInput.off('keyup', searchInputKeyupHandler);
            $searchInput.off('blur', searchInputBlurHandler);
            $document.off('mousedown', documentMousedownHandler);
          }

          function documentMousedownHandler(event) {
            var targetBelongsToThisComponent = $.contains(elem[0], event.target);
            if (targetBelongsToThisComponent) {
              closeOnBlur = false;
            } else {
              closeOnBlur = true;
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
            return _.findIndex(uiVirtualSelectController.optionsProvider.items, function(item) {
              return uiVirtualSelectController.optionsProvider.identity(item) === uiVirtualSelectController.optionsProvider.identity(itemToFind);
            });
          }

          function updateItemElements(items) {
            _.each(items, function(item, index) {
              var itemElement = $canvas.children('.ui-virtual-select--item').eq(index);
              if (itemElement.length === 0) {
                itemElement = $(document.createElement('div')).addClass('ui-virtual-select--item');
                itemElement.appendTo($canvas);
                itemElement.on('mouseenter', function(event) {
                  // workaround to prevent scripted scrolling from triggering mousemove events
                  if (event.pageX !== lastKnownMousePosition.x || event.pageY !== lastKnownMousePosition.y) {
                    activeItemIndex = $(this).data('index');
                    updateItemElements(uiVirtualSelectController.items);
                  }
                });
                itemElement.on('click', function() {
                  var itemIndex = $(this).data('index');
                  selectItem(itemIndex);
                });
              }
              itemElement.data('index', item.index);
              itemElement.data('item', item.value);
              itemElement.text(uiVirtualSelectController.optionsProvider.displayText(item.value));
              if (item.index === activeItemIndex) {
                itemElement.addClass('active');
              } else {
                itemElement.removeClass('active');
              }
            });
            _.each(_.range(items.length, options.itemsRendered), function(index) {
              var itemElement = $canvas.children('.ui-virtual-select--item')[index];
              if (itemElement) {
                itemElement.remove();
              }
            });
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
            var firstItem = Math.max(Math.floor(scrollTop / options.itemHeight) - options.itemsVisible, 0);
            var lastItem = Math.min(firstItem + options.itemsRendered, uiVirtualSelectController.optionsProvider.size());
            uiVirtualSelectController.items = _.map(uiVirtualSelectController.optionsProvider.get(firstItem, lastItem), function(value, index) {
              return {
                value: value,
                index: firstItem + index
              };
            });
            updateItemElements(uiVirtualSelectController.items);
            $items.css({
              'height': (Math.min(options.itemsVisible, uiVirtualSelectController.optionsProvider.size()) * options.itemHeight) + 'px',
              'overflow-y': 'scroll'
            });
            $canvas.css({
              'height': (uiVirtualSelectController.optionsProvider.size() * options.itemHeight - firstItem * options.itemHeight) + 'px',
              'margin-top': (firstItem * options.itemHeight) + 'px'
            });
          }

          $searchInput.on('focus', function() {
            scope.$apply(function() {
              uiVirtualSelectController.isLoading = true;
            });
            uiVirtualSelectController.optionsProvider.load().then(function() {
              uiVirtualSelectController.isLoading = false;
              updateItemList();
              showItems();
              scope.$evalAsync(adjustScrollPosition);
            });
            $searchInput.on('keydown', searchInputKeydownHandler);
            $searchInput.on('keyup', searchInputKeyupHandler);
            $searchInput.on('blur', searchInputBlurHandler);
            $document.on('mousedown', documentMousedownHandler);
          });

          $items.on('scroll', function() {
            scrollTop = $items.scrollTop();
            updateItemList();
          });

          $canvas.on('mousemove', function(event) {
            lastKnownMousePosition.x = event.pageX;
            lastKnownMousePosition.y = event.pageY;
          });

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
        };
      },
      bindToController: true,
      scope: {
        optionsProvider: '=?uiOptionsProvider',
        onSelectCallback: '&uiOnSelect',
        onCloseCallback: '&uiOnClose'
      }
    };
  }]);

angular.module("uiVirtualSelect").run(["$templateCache", function($templateCache) {$templateCache.put("ui-virtual-select.tpl.html","<div class=\"ui-virtual-select\" ng-class=\"{open: select.isOpen, loading: select.isLoading}\">\n	<input type=\"text\" class=\"ui-virtual-select--search-input\" placeholder=\"{{ select.formatSearchInput(select.selectedItem) }}\" />\n	<div class=\"ui-virtual-select--loading-indicator\" ng-show=\"select.isLoading\">\n		Loading...\n	</div>\n	<div class=\"ui-virtual-select--items\">\n		<div class=\"ui-virtual-select--canvas\"></div>\n	</div>\n</div>");}]);
//# sourceMappingURL=ui-virtual-select.js.map
