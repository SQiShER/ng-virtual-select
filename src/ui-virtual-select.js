'use strict';

angular.module('app', [])

  .controller('AppController', function(uiVirtualSelectDataProvider) {
    this.selection = {
      id: '500',
      name: '500'
    };
    this.uiVirtualSelectDataProvider = uiVirtualSelectDataProvider;
  })

  .factory('uiVirtualSelectDataProvider', function() {
    var DataProvider = function() {
      this.availableItems = [];
      for (var i = 1; i < 1000; i++) {
        this.availableItems.push({
          id: '' + i,
          name: '' + i
        });
      }
      this.items = this.availableItems;
    };
    DataProvider.prototype.filter = function(search) {
      if (search.length > 0) {
        this.items = _.filter(this.availableItems, function(item) {
          return item.name.indexOf(search) == 0;
        });
      } else {
        this.items = this.availableItems;
      }
    };
    DataProvider.prototype.get = function(firstItem, lastItem) {
      return this.items.slice(firstItem, lastItem);
    };
    DataProvider.prototype.size = function() {
      return this.items.length;
    };
    DataProvider.prototype.identity = function(item) {
      return item.id;
    };
    DataProvider.prototype.displayText = function(item) {
      return item && item.name;
    };
    return new DataProvider();
  })

  .directive('uiVirtualSelect', function($timeout) {
    return {
      restrict: 'E',
      require: ['uiVirtualSelect', 'ngModel'],
      templateUrl: 'src/ui-virtual-select.tpl.html',
      controller: function() {
        var lastKnownMousePosition = {
          x: 0,
          y: 0
        };
        this.items = [];
        this.search = '';
        this.activeItemIndex = 0;
        this.isOpen = false;
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

        var ArrowUp = 38;
        var ArrowDown = 40;
        var Enter = 13;
        var Escape = 27;

        var cellsPerPage = 10;
        var numberOfCells = 3 * cellsPerPage;
        var cellHeight = 30;
        var scrollTop = 0;
        var previousSearch = '';

        uiVirtualSelectController.select = function(item) {
          uiVirtualSelectController.selectedItem = item.value;
          ngModelController.$setViewValue(uiVirtualSelectController.selectedItem);
          hideItemList();
          clearInput();
        };

        elem.find('.items').on('scroll', function() {
          scrollTop = elem.find('.items').scrollTop();
          updateItemList();
          scope.$apply();
        });

        elem.find('.select-input').on('focus', function() {
          updateItemList();
          showItemList();
          scope.$apply();
        });

        elem.find('.select-input').on('keydown', function(event) {
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
        });

        elem.find('.select-input').on('keyup', function(event) {
          var search = $(event.target).val();
          if (search !== previousSearch) {
            scope.optionsProvider.filter(search);
            uiVirtualSelectController.activeItemIndex = 0;
            updateItemList();
            scrollTo(0);
          }
        });

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

        function showItemList() {
          var selectedIndex = indexOfItem(uiVirtualSelectController.selectedItem);
          scope.$apply(function() {
            uiVirtualSelectController.isOpen = true;
            uiVirtualSelectController.activate({
              index: selectedIndex
            });
          });
          $timeout(function() {
            scrollTo(selectedIndex);
          });
        }

        function hideItemList() {
          uiVirtualSelectController.isOpen = false;
        }

        function scrollTo(index) {
          elem.find('.items').scrollTop(cellHeight * Math.max(0, index));
        }

        function cancel() {
          clearInput();
          hideItemList();
          uiVirtualSelectController.activeItemIndex = 0;
        }

        function clearInput() {
          elem.find('.select-input').val('');
          elem.find('.select-input').trigger('blur');
          scope.optionsProvider.filter('');
        }

        function indexOfItem(itemToFind) {
          return _.findIndex(scope.optionsProvider.items, function(item) {
            return scope.optionsProvider.identity(item) === scope.optionsProvider.identity(itemToFind);
          });
        }

        function updateItemList() {
          var firstItem = Math.max(Math.floor(scrollTop / cellHeight) - cellsPerPage, 0);
          var lastItem = firstItem + numberOfCells;
          scope.$apply(function() {
            uiVirtualSelectController.items = _.map(scope.optionsProvider.get(firstItem, lastItem), function(value, index) {
              return {
                cellId: index,
                value: value,
                index: firstItem + index
              };
            });
          });
          elem.find('.items').css({
            'height': (Math.min(cellsPerPage, scope.optionsProvider.size()) * cellHeight) + 'px',
            'overflow-y': 'scroll'
          });
          elem.find('.canvas').css({
            'height': (scope.optionsProvider.size() * cellHeight - firstItem * cellHeight) + 'px',
            'margin-top': (firstItem * cellHeight) + 'px'
          });
        }

        $timeout(function() {
          uiVirtualSelectController.selectedItem = ngModelController.$viewValue;
        });
      },
      scope: {
        optionsProvider: '=?uiOptionsProvider'
      }
    };
  });
