'use strict';

angular.module('uiVirtualSelect', [])

  .directive('uiVirtualSelect', ['$timeout', '$document', '$window', function($timeout, $document, $window) {
    return {
      restrict: 'E',
      require: ['uiVirtualSelect', 'ngModel'],
      templateUrl: 'ui-virtual-select.tpl.html',
      controller: function() {
        var lastKnownMousePosition = {
          x: 0,
          y: 0
        };
        this.items = [];
        this.search = '';
        this.activeItemIndex = 0;
        this.isOpen = false;
        this.loading = false;
        this.activate = function(item, $event) {
          if (!$event) {
            this.activeItemIndex = item.index;
          } else if ($event.pageX !== lastKnownMousePosition.x || $event.pageY !== lastKnownMousePosition.y) {
            // workaround to prevent scripted scrolling from triggering mousemove events
            lastKnownMousePosition.x = $event.pageX;
            lastKnownMousePosition.y = $event.pageY;
            this.activeItemIndex = item.index;
          }
        };
        this.isActive = function(item) {
          return item.index === this.activeItemIndex;
        };
      },
      controllerAs: 'select',
      link: function(scope, elem, attrs, controllers) {
        var uiVirtualSelectController = controllers[0];
        var ngModelController = controllers[1];

        function detectItemHeight() {
          var $sampleItem = $('<div class="ui-virtual-select--item">Text</div>').hide().appendTo("body");
          var height = $sampleItem.outerHeight();
          $sampleItem.remove();
          return height;
        }

        var ArrowUp = 38;
        var ArrowDown = 40;
        var Enter = 13;
        var Escape = 27;

        var cellsPerPage = 10;
        var cellHeight = detectItemHeight();
        var numberOfCells = 3 * cellsPerPage;
        var scrollTop = 0;
        var previousSearch = '';
        var closeOnBlur = true;

        var $searchInput = elem.find('.ui-virtual-select--search-input');

        function searchInputKeydownHandler(event) {
          var key = event.which;
          if (key === ArrowUp) {
            moveUp();
          } else if (key === ArrowDown) {
            moveDown();
          } else if (key === Enter) {
            onEnter();
          } else if (key === Escape) {
            cancel();
          }
          scope.$apply();
        }

        function searchInputKeyupHandler(event) {
          var search = $(event.target).val();
          if (search !== previousSearch) {
            scope.optionsProvider.filter(search);
            previousSearch = search;
            uiVirtualSelectController.activeItemIndex = 0;
            updateItemList();
            scrollTo(0);
          }
          scope.$apply();
        }

        function searchInputBlurHandler() {
          if (closeOnBlur) {
            hideItems();
            scope.$apply();
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
            cancel();
          }
        }

        function moveUp() {
          var firstVisibleItem = Math.ceil((scrollTop + cellHeight) / cellHeight) - 1;
          if (uiVirtualSelectController.activeItemIndex > 0) {
            uiVirtualSelectController.activeItemIndex--;
            if (uiVirtualSelectController.activeItemIndex < firstVisibleItem) {
              scrollTo(Math.ceil(scrollTop / cellHeight) - 1);
            }
          }
        }

        function moveDown() {
          var lastVisibleItem = Math.floor((scrollTop + cellHeight) / cellHeight) + cellsPerPage - 1;
          if (uiVirtualSelectController.activeItemIndex < scope.optionsProvider.size() - 1) {
            uiVirtualSelectController.activeItemIndex++;
            if (uiVirtualSelectController.activeItemIndex >= lastVisibleItem) {
              scrollTo(Math.floor(scrollTop / cellHeight) + 1);
            }
          }
        }

        function onEnter() {
          var selectedItem = _.find(uiVirtualSelectController.items, function(item) {
            return item.index === uiVirtualSelectController.activeItemIndex;
          });
          uiVirtualSelectController.select(selectedItem);
        }

        function scrollTo(index) {
          scrollTop = Math.max(0, index) * cellHeight;
          elem.find('.ui-virtual-select--items').scrollTop(scrollTop);
        }

        function cancel() {
          clearInput();
          hideItems();
          uiVirtualSelectController.activeItemIndex = 0;
        }

        function clearInput() {
          elem.find('.ui-virtual-select--search-input').val('');
          elem.find('.ui-virtual-select--search-input').trigger('blur');
          scope.optionsProvider.filter('');
        }

        function indexOfItem(itemToFind) {
          return _.findIndex(scope.optionsProvider.items, function(item) {
            return scope.optionsProvider.identity(item) === scope.optionsProvider.identity(itemToFind);
          });
        }

        function updateItemList() {
          var firstItem = Math.max(Math.floor(scrollTop / cellHeight) - cellsPerPage, 0);
          var lastItem = Math.min(firstItem + numberOfCells, scope.optionsProvider.size());
          uiVirtualSelectController.items = _.map(scope.optionsProvider.get(firstItem, lastItem), function(value, index) {
            return {
              cellId: index,
              value: value,
              index: firstItem + index
            };
          });
          elem.find('.ui-virtual-select--items').css({
            'height': (Math.min(cellsPerPage, scope.optionsProvider.size()) * cellHeight) + 'px',
            'overflow-y': 'scroll'
          });
          elem.find('.ui-virtual-select--canvas').css({
            'height': (scope.optionsProvider.size() * cellHeight - firstItem * cellHeight) + 'px',
            'margin-top': (firstItem * cellHeight) + 'px'
          });
        }

        elem.find('.ui-virtual-select--items').on('scroll', function() {
          scrollTop = elem.find('.ui-virtual-select--items').scrollTop();
          updateItemList();
          scope.$apply();
        });

        scope.$on('ui-virtual-select:focus', function() {
          elem.find('.ui-virtual-select--search-input').focus();
        });

        function performAfterRender(callback) {
          if ($window.requestAnimationFrame) {
            $window.requestAnimationFrame(callback);
          } else {
            $timeout(callback, 100);
          }
        }

        function adjustScrollPosition() {
          var scrollIndex = 0;
          if (uiVirtualSelectController.selectedItem) {
            scrollIndex = indexOfItem(uiVirtualSelectController.selectedItem);
          }
          uiVirtualSelectController.activate({
            index: scrollIndex
          });
          scrollTo(scrollIndex);
        }

        uiVirtualSelectController.select = function(item) {
          uiVirtualSelectController.selectedItem = item.value;
          ngModelController.$setViewValue(uiVirtualSelectController.selectedItem);
          scope.onSelectCallback({
            selection: item.value
          });
          hideItems();
          clearInput();
        };

        uiVirtualSelectController.searchInputFocusHandler = function() {
          uiVirtualSelectController.loading = true;
          scope.optionsProvider.load().then(function() {
            uiVirtualSelectController.loading = false;
            updateItemList();
            showItems();
            scope.$evalAsync(adjustScrollPosition);
          });
          $searchInput.on('keydown', searchInputKeydownHandler);
          $searchInput.on('keyup', searchInputKeyupHandler);
          $searchInput.on('blur', searchInputBlurHandler);
          $document.on('mousedown', documentMousedownHandler);
        };

        function hideItems() {
          elem.find('.ui-virtual-select--items').css('display', 'none');
          scope.$evalAsync(function() {
            uiVirtualSelectController.isOpen = false;
          });
          scope.onCloseCallback();
        }

        function showItems() {
          elem.find('.ui-virtual-select--items').css('display', 'block');
          scope.$evalAsync(function() {
            uiVirtualSelectController.isOpen = true;
          });
        }

        uiVirtualSelectController.formatSearchInput = function(item) {
          if (item) {
            return scope.optionsProvider.displayText(item);
          } else {
            if (scope.optionsProvider.noSelectionText) {
              return scope.optionsProvider.noSelectionText();
            } else {
              return '';
            }
          }
        };

        ngModelController.$render = function() {
          uiVirtualSelectController.selectedItem = ngModelController.$viewValue;
        };
      },
      scope: {
        optionsProvider: '=?uiOptionsProvider',
        onSelectCallback: '&uiOnSelect',
        onCloseCallback: '&uiOnClose'
      }
    };
  }]);

angular.module("uiVirtualSelect").run(["$templateCache", function($templateCache) {$templateCache.put("ui-virtual-select.tpl.html","<div class=\"ui-virtual-select\" ng-class=\"{open: select.isOpen, loading: select.loading}\">\n	<input type=\"text\" class=\"ui-virtual-select--search-input\" ng-focus=\"select.searchInputFocusHandler($event)\" placeholder=\"{{ select.formatSearchInput(select.selectedItem) }}\" />\n	<div class=\"ui-virtual-select--loading-indicator\" ng-if=\"select.loading\">\n		Loading...\n	</div>\n	<div class=\"ui-virtual-select--items\">\n		<div class=\"ui-virtual-select--canvas\">\n			<div class=\"ui-virtual-select--item\" ng-repeat=\"item in select.items track by item.cellId\" ng-class=\"{active: select.isActive(item)}\" ng-mousemove=\"select.activate(item, $event)\" ng-click=\"select.select(item)\">{{ optionsProvider.displayText(item.value) }}</div>\n		</div>\n	</div>\n</div>\n");}]);
//# sourceMappingURL=ui-virtual-select.js.map
