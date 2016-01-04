'use strict';

angular.module('app', ['uiVirtualSelect'])

  .controller('AppController', ['$scope', '$timeout', 'uiVirtualSelectDataProvider', function($scope, $timeout, uiVirtualSelectDataProvider) {
    var intitialSelection = {
      id: '5',
      name: '5',
    };
    var self = this;
    this.selection = intitialSelection;
    this.uiVirtualSelectDataProvider = uiVirtualSelectDataProvider;
    this.resetSelection = function() {
      self.selection = intitialSelection;
      console.log('resetting to', intitialSelection);
    };
    this.focusInput = function() {
      $scope.$broadcast('ui-virtual-select:focus');
    };
    this.loadInput = function() {
      $scope.$broadcast('ui-virtual-select:load');
    };
  // this.makeItSlow = function() {
  //   for (var i = 0; i < 200000000; i++) {
  //     // meh
  //   }
  //   console.log('meh');
  //   return true;
  // };
  }])

  .factory('uiVirtualSelectDataProvider', ['$q', '$timeout', function($q, $timeout) {
    var DataProvider = function() {
      this.availableItems = null;
      this.items = null;
    };

    DataProvider.prototype.load = function() {
      var deferred = $q.defer();
      var self = this;
      if (this.availableItems) {
        deferred.resolve();
      } else {
        $timeout(function() {
          self.availableItems = [];
          for (var i = 1; i < 1000; i++) {
            self.availableItems.push({
              id: '' + i,
              name: '' + i,
            });
          }
          self.items = self.availableItems;
          deferred.resolve();
        }, 1000);
      }
      return deferred.promise;
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

    DataProvider.prototype.identity = function(item) {
      return item.id;
    };

    DataProvider.prototype.displayText = function(item, extended) {
      if (item) {
        return extended ? item.name + ' (' + item.id + ')' : item.name;
      } else {
        return '';
      }
    };
    DataProvider.prototype.noSelectionText = function() {
      return 'Please choose';
    };

    return new DataProvider();
  }]);
