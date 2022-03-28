import  mongoose from "mongoose"

const schema = new mongoose.Schema(
  {
    FirstName: {
      type: String,
      required: true,
    },
    LastName: {
      type: String,
      required: true,
    },
    DateOfBirth:{
      type :String
    },
    EmiratesID :{
      type : String,
      required:true
      },
    Gender : {
    enum : ["Male","Female"]
    },
    Department:{
      type :String,
      required:true
    },
    CourseTitle : {
     type :String,
     required:true
    },
    
    Email: {
      type: String,
      required: true,
      trim:true,
      lowercase:true,
      unique:true,
      //* use validate for inside field validation  

      // validate:{
      //   validator: isEmail,
      //   message: 'Please enter valid email',
      //   isAsync: false
      // }
    },

    Password : {
      type:String
    }
},
  { timestamps: true }
);

module.exports = mongoose.model("learner", schema);
