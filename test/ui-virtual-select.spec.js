'use strict';

describe('directive', () => {

  let Context;

  class MockOptionsProvider {
    constructor($q) {
      this.availableItems = [];
      this.items = [];
      this.deferredLoad = $q.defer();
    }
    load() {
      return this.deferredLoad.promise;
    }
    resolveLoad(itemCount = 100) {
      class Item {
        constructor(id) {
          this.id = id;
          this.firstname = `First${id}`;
          this.lastname = `Last${id}`;
        }
      }
      let items = [];
      for (let i = 0; i < itemCount; i++) {
        items.push(new Item(i));
      }
      this.availableItems = items;
      this.items = items;
      this.deferredLoad.resolve();
    }
    rejectLoad() {
      this.deferredLoad.reject();
    }
    get(firstItem, lastItem) {
      return this.items.slice(firstItem, lastItem);
    }
    // filter(search) {}
    size() {
      return this.items.length;
    }
    identity(item) {
      return item && item.id;
    }
    displayText(item) {
      if (!item) {
        return '';
      }
      let {firstname, lastname} = item;
      return `${lastname}, ${firstname}`;
    }
    noSelectionText() {
      return `none`;
    }
  }

  beforeEach(module('uiVirtualSelect'));
  beforeEach(module('ui-virtual-select.tpl.html'));
  beforeEach(inject(($compile, $rootScope, $q) => {
    Context = {
      '$compile': $compile,
      '$rootScope': $rootScope,
      '$q': $q
    };
  }));

  afterEach(() => {
    Context.$element.remove();
    Context.$style.remove();
  });

  function createDirective({selection = null, optionsProvider = {}} = {}) {
    let styleElement = $(`<style type="text/css">
    .ui-virtual-select--item {
      line-height: 16px;
      padding: 7px 0;
    }
    </style>`);
    $(document.head).append(styleElement);
    let $element = angular.element('<ui-virtual-select ng-model="data.selection" ui-options-provider="data.optionsProvider"></ui-virtual-select>');
    $(document.body).append($element);
    let $scope = Context.$rootScope.$new();
    $scope.data = {
      selection: selection,
      optionsProvider: optionsProvider
    }
    Context.$compile($element)($scope);
    Context.$element = $element;
    Context.$style = styleElement;
    Context.$scope = $scope;
    Context.$rootScope.$digest();
  }

  describe('in any case', () => {
    beforeEach(() => {
      createDirective();
    });
    it('container element should exist', () => {
      expect(Context.$element).to.have.descendants('.ui-virtual-select');
    });
    it('search input should display the selected value as placeholder text', () => {
      let placeholderText = 'I always wanted to be a placeholder text!';
      Context.$rootScope.$apply(() => {
        Context.$scope.data.selection = {
          name: placeholderText
        };
        Context.$scope.data.optionsProvider = {
          displayText: function(item) {
            return item.name;
          }
        };
      })
      expect(Context.$element.find('.ui-virtual-select--search-input')).to.have.attr('placeholder', placeholderText);
    });
  });

  describe('when search input has no focus,', () => {
    beforeEach(function() {
      createDirective();
    });
    it(`container element should not have class "open"`, () => {
      expect(Context.$element.find('.ui-virtual-select')).not.to.have.class('open');
    });
    it(`items should be hidden`, () => {
      expect(Context.$element.find('.ui-virtual-select--items')).not.to.be.visible;
    });
    it(`loading indicator should not exist`, () => {
      expect(Context.$element.find('.ui-virtual-select--loading-indicator')).to.exist;
    });
  });

  describe(`when search input gains focus`, () => {
    let deferred;
    beforeEach(function() {
      createDirective();
    });
    beforeEach(inject($q => {
      Context.$rootScope.$apply(function() {
        Context.$scope.data.optionsProvider = {
          load: sinon.stub(),
          get: sinon.stub(),
          size: sinon.stub(),
          displayText: function(item) {
            return item && item.name;
          }
        };
      });
      deferred = $q.defer()
      Context.$scope.data.optionsProvider.load.returns(deferred.promise);
      Context.$element.find('.ui-virtual-select--search-input').focus();
    }));
    it(`"load" function of options provider should be called`, () => {
      expect(Context.$scope.data.optionsProvider.load).to.have.been.called;
    });
    it(`loading indicator should only be visible while "load" promise is pending`, () => {
      expect(Context.$element.find('.ui-virtual-select--loading-indicator')).to.be.visible;
      deferred.resolve();
      Context.$rootScope.$digest();
      expect(Context.$element.find('.ui-virtual-select--loading-indicator')).not.to.be.visible;
    });
    it(`items should be visible once options have been loaded`, () => {
      deferred.resolve();
      Context.$rootScope.$digest();
      expect(Context.$element.find('.ui-virtual-select--items')).to.be.visible;
    });
  });

  describe(`option list:`, () => {
    beforeEach(() => {
      createDirective();
      Context.$scope.data.optionsProvider = new MockOptionsProvider(Context.$q);
      Context.$scope.$digest();
      Context.$element.find('.ui-virtual-select--search-input').focus();
    });

    describe(`given no options`, () => {
      beforeEach(() => {
        Context.$scope.data.optionsProvider.resolveLoad(0);
        Context.$scope.$digest();
      });
      it(`.ui-virtual-select--items should display "empty text"`);
    });

    describe(`given less than 10 options`, () => {
      const itemHeight = 30;
      const numberOfItems = 5;
      beforeEach(() => {
        Context.$scope.data.optionsProvider.resolveLoad(numberOfItems);
        Context.$scope.$digest();
      });
      it(`.ui-virtual-select--items height should be the number of items times the (computed) height of a single item`, () => {
        expect(Context.$element.find('.ui-virtual-select--items')).to.have.css('height', (numberOfItems * itemHeight) + 'px');
      });
      it(`.ui-virtual-select--canvas height should be the number of items times the (computed) height of a single item`, () => {
        expect(Context.$element.find('.ui-virtual-select--canvas')).to.have.css('height', (numberOfItems * itemHeight) + 'px');
      });
    });

    describe(`given more than 10 options`, () => {
      const itemHeight = 30;
      const numberOfItems = 50;
      beforeEach(() => {
        Context.$scope.data.optionsProvider.resolveLoad(numberOfItems);
        Context.$scope.$digest();
      });
      it(`.ui-virtual-select--items height should be 10 times the (computed) height of a single item`, () => {
        expect(Context.$element.find('.ui-virtual-select--items')).to.have.css('height', (10 * itemHeight) + 'px');
      });
      it(`.ui-virtual-select--canvas height should be the number of all items times the (computed) height of a single item`, () => {
        expect(Context.$element.find('.ui-virtual-select--canvas')).to.have.css('height', (numberOfItems * itemHeight) + 'px');
      });
      describe(`when scroll position moves so far that more than 10 upper items moved out of view`, () => {
        beforeEach(() => {
          Context.$element.find('.ui-virtual-select--items').scrollTop(15 * itemHeight);
          Context.$element.find('.ui-virtual-select--items').triggerHandler('scroll');
        });
        it(`.ui-virtual-select--canvas margin-top should equal the computed height of all items that have been scrolled out of view`, () => {
          expect(Context.$element.find('.ui-virtual-select--canvas')).to.have.css('margin-top', (5 * itemHeight) + 'px');
        });
      });
    });
  });

  describe(`search input:`, () => {
    let optionsProvider;
    const noSelectionText = 'no selection text';
    beforeEach(() => {
      optionsProvider = new MockOptionsProvider(Context.$q);
      createDirective({
        optionsProvider: optionsProvider
      });
      sinon.stub(optionsProvider, 'displayText');
      sinon.stub(optionsProvider, 'noSelectionText').returns(noSelectionText);
      Context.$scope.$digest();
    });
    describe(`given no initial selection`, () => {
      it(`displayText should not be called`, () => {
        expect(Context.$scope.data.optionsProvider.displayText).not.to.have.been.called;
      });
      it(`placeholder should contain text from optionsProvider.noSelectionText()`, () => {
        expect(Context.$scope.data.optionsProvider.noSelectionText).to.have.been.called;
        expect(Context.$element.find('.ui-virtual-select--search-input')).to.have.attr('placeholder', noSelectionText);
      });
      it(`placeholder should be empty if optionsProvider.noSelectionText() does not exist`, () => {
        optionsProvider.noSelectionText = null;
        Context.$scope.$digest();
        expect(Context.$element.find('.ui-virtual-select--search-input')).to.have.attr('placeholder', '');
      });
    });
  });
});
