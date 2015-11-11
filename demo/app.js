'use strict';

angular.module('app', ['uiVirtualSelect'])

  .controller('AppController', function($scope, $timeout, uiVirtualSelectDataProvider) {
    var self = this;
    this.selection = {
      id: '500',
      name: '500'
    };
    this.uiVirtualSelectDataProvider = uiVirtualSelectDataProvider;
    this.resetSelection = function() {
      console.log('resetting selection...');
      self.selection = {
        id: '500',
        name: '500'
      };
    };
    $timeout(function() {
      $scope.$broadcast('ui-virtual-select:focus');
    });
  })

  .factory('uiVirtualSelectDataProvider', function($q, $timeout) {
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
              name: '' + i
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
  });
