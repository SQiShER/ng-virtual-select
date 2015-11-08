'use strict';

angular.module('app', [])

  .controller('AppController', function() {
    this.selection = {
      id: '500',
      name: '500'
    };
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
    return new DataProvider();
  })

  .directive('uiVirtualSelect', function(uiVirtualSelectDataProvider, $timeout) {
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

        uiVirtualSelectController.select = function(item) {
          uiVirtualSelectController.selectedItem = item.value;
          ngModelController.$setViewValue(uiVirtualSelectController.selectedItem);
          hideItemList();
          elem.find('.select-input').trigger('blur');
        };

        elem.find('.select-input').on('focus', showItemList);
        elem.find('.select-input').on('keydown', function(event) {
          var key = event.which;
          var scrollTop = elem.find('.items').scrollTop();
          var firstVisibleItem = Math.ceil((scrollTop + cellHeight) / cellHeight) - 1;
          var lastVisibleItem = Math.floor((scrollTop + cellHeight) / cellHeight) + cellsPerPage - 1;
          if (key === ArrowUp) {
            if (uiVirtualSelectController.activeItemIndex > 0) {
              uiVirtualSelectController.activeItemIndex--;
              if (uiVirtualSelectController.activeItemIndex < firstVisibleItem) {
                elem.find('.items').scrollTop((Math.ceil(scrollTop / cellHeight) - 1) * cellHeight);
              }
            }
          } else if (key === ArrowDown) {
            if (uiVirtualSelectController.activeItemIndex < uiVirtualSelectDataProvider.size() - 1) {
              uiVirtualSelectController.activeItemIndex++;
              if (uiVirtualSelectController.activeItemIndex >= lastVisibleItem) {
                elem.find('.items').scrollTop((Math.floor(scrollTop / cellHeight) + 1) * cellHeight);
              }
            }
          } else if (key === Enter) {
            var selectedItem = _.find(uiVirtualSelectController.items, function(item) {
              return item.index === uiVirtualSelectController.activeItemIndex;
            });
            uiVirtualSelectController.select(selectedItem);
          } else if (key === Escape) {
            // clear input
            // hide list
            // reset active item
          }
          scope.$apply();
        });

        elem.find('.select-input').on('keyup', function(event) {
          var key = event.which;
          if (key !== Enter && key !== ArrowUp && key !== ArrowDown && key !== Escape) {
            var search = $(event.target).val();
            uiVirtualSelectDataProvider.filter(search);
            uiVirtualSelectController.activeItemIndex = 0;
            updateItemList();
            elem.find('.items').scrollTop(0);
            scope.$apply();
          }
        });

        function showItemList() {
          elem.find('.items').addClass('open');
          var selectedIndex = indexOfItem(uiVirtualSelectController.selectedItem);
          scrollTo(selectedIndex);
          uiVirtualSelectController.activate({
            index: selectedIndex
          });
        }

        function hideItemList() {
          elem.find('.items').removeClass('open');
        }

        function scrollTo(index) {
          elem.find('.items').scrollTop(cellHeight * Math.max(0, index));
          scope.$apply();
        }

        function indexOfItem(itemToFind) {
          return _.findIndex(uiVirtualSelectDataProvider.items, function(item) {
            return item.id === itemToFind.id;
          });
        }

        function updateItemList() {
          var firstItem = Math.max(Math.floor(scrollTop / cellHeight) - cellsPerPage, 0);
          var lastItem = firstItem + numberOfCells;
          uiVirtualSelectController.items = _.map(uiVirtualSelectDataProvider.get(firstItem, lastItem), function(value, index) {
            return {
              cellId: index,
              value: value,
              index: firstItem + index
            };
          });
          elem.find('.items').css({
            'height': (Math.min(cellsPerPage, uiVirtualSelectDataProvider.size()) * cellHeight) + 'px',
            'overflow-y': 'scroll'
          });
          elem.find('.canvas').css({
            'height': (uiVirtualSelectDataProvider.size() * cellHeight - firstItem * cellHeight) + 'px',
            'margin-top': (firstItem * cellHeight) + 'px'
          });
        }

        elem.find('.items').on('scroll', function() {
          scrollTop = elem.find('.items').scrollTop();
          updateItemList();
          scope.$apply();
        });

        $timeout(function() {
          uiVirtualSelectController.selectedItem = ngModelController.$viewValue;
        });

        updateItemList();
      },
      scope: {
        options: '='
      }
    };
  });
