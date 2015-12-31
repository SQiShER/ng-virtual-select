'use strict';

var DataProvider = function() {
  this.availableItems = null;
  this.items = null;
};
DataProvider.prototype.load = function() {
  var deferred = Q.defer();
  var self = this;
  if (this.availableItems) {
    deferred.resolve();
  } else {
    setTimeout(function() {
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
      return item.name.indexOf(search) === 0;
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
var dataProvider = new DataProvider();

$(document).ready(function() {

  $('.virtual-select').virtualselect({
    dataProvider: dataProvider,
    onSelect: function(item) {
      $('.virtual-select--selection').text(JSON.stringify(item));
    },
  });

  $('#select').click(function() {
    $('.virtual-select').virtualselect('select', {
      "id": "5",
      "name": "5",
    });
  });

  $('#focus').click(function() {
    $('.virtual-select').virtualselect('focus');
  });

  $('#fetch').click(function() {
    $('.virtual-select').virtualselect('load');
  });

});
