export const services = ['Lawn Care','Landscaping','Pool Maintenance','Pressure Washing','Interior Cleaning','Airbnb Cleaning','Handyman','Epoxy Flooring','Commercial Maintenance','Apartment Maintenance','HOA Maintenance','Property Maintenance Plans','Sod Installation','Irrigation / Sprinkler Repair','Fence Installation / Repair','Window Cleaning','Gutter Cleaning','Dryer Vent Cleaning','Holiday / Seasonal Décor'];
export const employees = [
  {id:1,name:'Caiden',role:'Manager',status:'Active'},
  {id:2,name:'Preston',role:'Technician',status:'Active'},
  {id:3,name:'David',role:'Technician',status:'Active'},
  {id:4,name:'Trey',role:'Technician',status:'Active'}
];
export const customers = [
  {id:1,name:'DJ Harmon',email:'djharmon17@gmail.com',phone:'',type:'Residential',status:'Active'},
  {id:2,name:'Jason Garvine',email:'jason.garvine@gmail.com',phone:'',type:'Residential',status:'Active'},
  {id:3,name:'Faris Residences Georgetown',email:'',phone:'',type:'Commercial',status:'Prospect'}
];
export const properties = [
  {id:1,customer:'DJ Harmon',address:'212 Bermuda Bay Dr Unit 101, Conway, SC 29526',type:'Residential',notes:'Deep cleaning customer'},
  {id:2,customer:'Jason Garvine',address:'121 Berry Tree Ln, Conway, SC',type:'Residential',notes:'Recurring lawn care'},
  {id:3,customer:'Faris Residences Georgetown',address:'Georgetown, SC',type:'Commercial',notes:'Maintenance proposal'}
];
export const workOrders = [
  {id:1001,service:'Deep Cleaning',customer:'DJ Harmon',property:'212 Bermuda Bay Dr Unit 101',assigned:'Caiden',date:'Today',status:'Scheduled',price:300},
  {id:1002,service:'Lawn Care',customer:'Jason Garvine',property:'121 Berry Tree Ln',assigned:'Preston',date:'Monday',status:'New',price:35},
  {id:1003,service:'Commercial Maintenance',customer:'Faris Residences',property:'Georgetown',assigned:'Ray',date:'Pending',status:'Needs Follow-Up',price:0}
];
export const estimates = [
  {id:501,customer:'Faris Residences Georgetown',service:'Premier Property Maintenance',amount:4200,status:'Sent',validUntil:'30 days'},
  {id:502,customer:'DJ Harmon',service:'Deep Cleaning',amount:300,status:'Approved',validUntil:'Accepted'},
  {id:503,customer:'Jason Garvine',service:'Weekly Lawn Care',amount:35,status:'Approved',validUntil:'Recurring'}
];
export const invoices = [
  {id:701,customer:'DJ Harmon',amount:300,status:'Unpaid',due:'Immediately After Service'},
  {id:702,customer:'Jason Garvine',amount:140,status:'Draft',due:'Monthly'},
  {id:703,customer:'Melody Hatcher',amount:200,status:'Draft',due:'Monthly'}
];
export const portalRequests = [
  {id:801,customer:'Residential Client',request:'Need quote for irrigation repair',status:'New'},
  {id:802,customer:'Commercial Prospect',request:'Monthly maintenance plan inquiry',status:'Reviewing'}
];

export const equipment = [
  {id:1,name:'Zero Turn Mower',type:'Lawn Equipment',status:'Ready',nextService:'25 engine hours',assigned:'Lawn Crew'},
  {id:2,name:'Pressure Washer',type:'Cleaning Equipment',status:'Maintenance Due',nextService:'Inspect pump and hoses',assigned:'Preston'},
  {id:3,name:'Trailer',type:'Fleet',status:'Ready',nextService:'Check tires and lights',assigned:'Caiden'}
];
export const commercialAccounts = [
  {id:1,name:'Faris Residences Georgetown',type:'Apartment / Multifamily',monthlyValue:4200,status:'Proposal Sent',contact:'Stephanie'},
  {id:2,name:'Property Management Portfolio',type:'Property Management Company',monthlyValue:2500,status:'Target',contact:'Operations Manager'},
  {id:3,name:'HOA Maintenance Prospect',type:'HOA',monthlyValue:1800,status:'Prospecting',contact:'Board Member'}
];
export const crewPerformance = [
  {name:'Caiden',completed:12,photos:28,callbacks:0,score:96},
  {name:'Preston',completed:9,photos:18,callbacks:1,score:88},
  {name:'David',completed:7,photos:14,callbacks:0,score:91},
  {name:'Trey',completed:6,photos:10,callbacks:1,score:84}
];
export const alerts = [
  {id:1,type:'Estimate Follow-Up',message:'Follow up with Faris Residences Georgetown proposal.',priority:'High'},
  {id:2,type:'Equipment',message:'Pressure washer needs maintenance check before next commercial wash.',priority:'Medium'},
  {id:3,type:'Reviews',message:'Send review requests for completed deep clean and lawn service.',priority:'High'}
];
