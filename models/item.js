var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var ItemSchema = Schema({
   name: {type: String, required: true, max: 100},
    quantity: {type: Number, required: true, max: 1000},
   price:{type:Number},
   sold:{type:Number},
   total:{
     type:Number
   }
  },{
    toObject:{
      virtuals:true
    },
    toJSON:{
      virtuals:true
    }
  });

// Virtual for item's full name
ItemSchema
.virtual('item_name')
.get(function () {
  return this.name + ', ' + this.quantity + ',' + this.price
});

// Virtual to update item quantity
ItemSchema
.virtual('quantityupdate')
.get(function(){
  return ((this.quantity-1));
});

// Virtual to update item total
ItemSchema
.virtual('totalupdate')
.get(function(){
  return((this.total + this.price));
});
// Virtual to update item sold.
ItemSchema
.virtual('soldupdate')
.get(function(){
  return  (this.sold+1)
});


//Export model
module.exports = mongoose.model('Item', ItemSchema);