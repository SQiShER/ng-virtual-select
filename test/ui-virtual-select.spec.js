'use strict';

describe('directive', () => {

  let Context = {};

  beforeEach(module('uiVirtualSelect'));

  beforeEach(module('ui-virtual-select.tpl.html'));

  beforeEach(inject(($compile, $rootScope) => {
    Context = {
      '$compile': $compile,
      '$rootScope': $rootScope
    };
  }));

  function createDirective() {
    let $element = angular.element('<ui-virtual-select ng-model="data.selection"></ui-virtual-select>');
    let $scope = Context.$rootScope.$new();
    $scope.data = {
      selection: null
    }
    Context.$compile($element)($scope);
    Context.$element = $element;
    Context.$scope = $scope;
    $scope.$digest();
  }

  it('should have container element', () => {
    createDirective();
    expect(Context.$element).to.have.descendants('.ui-virtual-select');
  });

});
