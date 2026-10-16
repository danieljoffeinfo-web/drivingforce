const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../dist/vehicles.json');
const sources=require('../research/description-sources.json');
const originals=require('../research/extracted-listings.json');
const {vehicleTitle}=require('../dist/finance-utils.js');

test('every current vehicle has a matched, substantial description and source record',()=>{
  assert.equal(data.vehicles.length,49);
  assert.equal(new Set(data.vehicles.map(c=>c.id)).size,49);
  for(const car of data.vehicles){
    const source=sources.vehicles.find(s=>s.id===car.id);
    assert.equal(source.stockCode,car.stock_code);
    assert.equal(source.originalUrl,car.permaLink);
    assert.equal(car.description.length,2);
    assert.ok(car.description.join(' ').split(/\s+/).length>=65,car.stock_code);
    assert.ok(car.description.join(' ').includes(car.stock_code));
    assert.ok(car.description.join(' ').includes(String(car.mile).replace(/\B(?=(\d{3})+(?!\d))/g,' ')));
    assert.ok(!/immaculate|accident.free|full service history|extended warrant/i.test(car.description.join(' ')));
    assert.equal(vehicleTitle(car),car.displayName);
  }
});

test('original-listing enhancements never cross stock references or primary images',()=>{
  for(const car of data.vehicles){
    if(car.descriptionSource==='inventory-facts'){
      assert.deepEqual(car.features,[]);
      continue;
    }
    const source=sources.vehicles.find(s=>s.id===car.id);
    const original=originals.find(s=>s.id===car.id);
    assert.ok(source.archiveUrl.includes(car.stock_code.toLowerCase()));
    assert.ok(original.photos.includes(car.imageUrl),car.stock_code);
    assert.match(source.archiveSha256,/^[a-f0-9]{64}$/);
    assert.ok(car.features.length>0);
  }
  assert.equal(data.vehicles.filter(c=>c.descriptionSource==='original-listing').length,9);
  assert.equal(data.vehicles.filter(c=>c.descriptionSource==='inventory-facts').length,40);
});
