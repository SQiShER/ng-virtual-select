'use strict'

angular.module('app', [])

  .controller('AppController', function() {
    var options = [];
    for (var i = 1; i < 1000; i++) {
      options.push({
        id: '' + i,
        name: '' + i
      });
    }
    this.options = options;
    this.selection = 500;
  })

  .directive('uiVirtualSelect', function() {
    return {
      restrict: 'E',
      require: ['uiVirtualSelect', 'ngModel'],
      templateUrl: 'src/ui-virtual-select.tpl.html',
      controller: function() {
        this.items = [];
        this.search = '';
      },
      controllerAs: 'select',
      link: function(scope, elem, attrs, controllers) {
        var cellsPerPage = 10;
        var numberOfCells = 3 * cellsPerPage;
        var cellHeight = 30;
        var scrollTop = 0;
        var search = '';
        var isOpen = false;
        var uiVirtualSelectController = controllers[0];
        var ngModelController = controllers[1];

        elem.find('.select-input').on('focus', showItemList);
        // elem.find('.select-input').on('blur', hideItemList);
        elem.find('.select-input').on('keyup', function(event) {
          search = $(event.target).val();
          updateItemList();
          scope.$apply();
        });

        function filterOptions() {
          if (search.length > 0) {
            return _.filter(scope.options, function(option) {
              return option.name.indexOf(search) == 0;
            });
          } else {
            return scope.options;
          }
        }

        function showItemList() {
          elem.find('.items').addClass('open');
        }

        function hideItemList() {
          elem.find('.items').removeClass('open');
        }

        function updateItemList() {
          var firstItem = Math.max(Math.floor(scrollTop / cellHeight) - cellsPerPage, 0);
          var lastItem = firstItem + numberOfCells;
          var filteredOptions = filterOptions();
          uiVirtualSelectController.items = _.map(filteredOptions.slice(firstItem, lastItem), function(value, index) {
            return _.extend({
              cellId: index
            }, value);
          });
          elem.find('.items').css({
            'height': (Math.min(cellsPerPage, filteredOptions.length) * cellHeight) + 'px',
            'overflow-y': 'scroll'
          });
          elem.find('.canvas').css({
            'height': (filteredOptions.length * cellHeight - firstItem * cellHeight) + 'px',
            'margin-top': (firstItem * cellHeight) + 'px',
          });
        }

        elem.find('.items').on('scroll', function(event) {
          scrollTop = elem.find('.items').scrollTop();
          updateItemList();
          scope.$apply();
        });

        updateItemList();
      },
      scope: {
        options: '='
      }
    };
  });
