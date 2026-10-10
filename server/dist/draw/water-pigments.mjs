// SPDX-License-Identifier: AGPL-3.0-only
// Water's palette, written by tools/generate-water-color.py from tools/data/water-pigments.json. Do not edit.
// One row a pigment: its Colour Index name, the colour of its swatch, seven absorbance coordinates and the opacity (the eighth),
// how much it granulates and how much it stains.
export const WATER_PIGMENT_DATA = [
 {id:"hansa-yellow",name:"Hansa Yellow Light",ci:"PY3",colour:"#ffe900",coefficients:[15.0895,16.4457,-7.61931,10.3979,-1.74801,5.26622,-.829917,0],granulation:.05,staining:.3},
 {id:"new-gamboge",name:"New Gamboge",ci:"PY153",colour:"#f29500",coefficients:[26.4406,20.5263,-7.08027,8.76319,-4.08373,.242012,-1.40045,0],granulation:.05,staining:.35},
 {id:"pyrrol-scarlet",name:"Pyrrol Scarlet",ci:"PR255",colour:"#dd2b1a",coefficients:[26.2488,18.6585,4.91689,-4.40719,.673722,-4.90952,-.86633,.01],granulation:.1,staining:.3},
 {id:"alizarin-crimson",name:"Permanent Alizarin Crimson",ci:"PR177",colour:"#920031",coefficients:[27.4581,14.936,9.6181,-12.2434,-3.15463,-4.61736,1.37861,0],granulation:.05,staining:.6},
 {id:"quinacridone-magenta",name:"Quinacridone Magenta",ci:"PR122",colour:"#ba2b7a",coefficients:[20.9669,8.60947,13.5043,-9.02344,-10.464,-5.676,1.02361,0],granulation:0,staining:.8},
 {id:"dioxazine-violet",name:"Dioxazine Violet",ci:"PV23",colour:"#540086",coefficients:[25.2381,4.44673,13.3369,-13.0208,4.45994,10.5655,2.87806,0],granulation:0,staining:.9},
 {id:"ultramarine",name:"French Ultramarine",ci:"PB29",colour:"#0056b2",coefficients:[18.5251,-1.28521,4.59717,-9.95544,1.68444,9.22006,.9766,0],granulation:.8,staining:.1},
 {id:"cerulean",name:"Cerulean Blue",ci:"PB35",colour:"#2ea3d2",coefficients:[19.9821,-13.7088,-2.82406,1.84011,.970487,-2.0154,4.59823,.03],granulation:.6,staining:0},
 {id:"phthalo-turquoise",name:"Phthalo Turquoise",ci:"PB16",colour:"#00828d",coefficients:[27.3997,-14.295,-5.63101,-4.56004,.648726,.32563,-1.96966,0],granulation:0,staining:.8},
 {id:"phthalo-green",name:"Phthalo Green",ci:"PG7",colour:"#007e5c",coefficients:[28.0207,-8.0551,-7.7665,-9.34346,.0759638,1.30139,-.391044,0],granulation:0,staining:1},
 {id:"sap-green",name:"Sap Green",ci:"PG36 + PY110",colour:"#5c8000",coefficients:[26.2511,15.5646,-10.6546,-4.94344,1.1452,.595003,1.82591,0],granulation:.1,staining:.4},
 {id:"perylene-green",name:"Perylene Green",ci:"PBk31",colour:"#2e612e",coefficients:[26.7779,6.04982,-4.78292,-10.2628,2.56018,2.72303,7.39044,0],granulation:.05,staining:.6},
 {id:"yellow-ochre",name:"Yellow Ochre",ci:"PY43",colour:"#c69e45",coefficients:[19.6415,3.82993,-3.9693,5.1754,-1.43635,-3.19688,6.20121,.015],granulation:.3,staining:.2},
 {id:"burnt-sienna",name:"Burnt Sienna",ci:"PR101",colour:"#a35719",coefficients:[23.4679,14.2589,.593654,-4.68609,-5.93624,-2.44992,-4.45317,0],granulation:.45,staining:.2},
 {id:"burnt-umber",name:"Burnt Umber",ci:"PBr7",colour:"#7c5d40",coefficients:[23.361,9.06297,-.500636,-3.36583,5.45658,-.641056,-3.75204,0],granulation:.5,staining:.2},
 {id:"davys-gray",name:"Davy's Gray",ci:"PBk19",colour:"#626359",coefficients:[26.0015,2.08067,-1.67614,1.91445,-.295763,1.27125,.385697,.015],granulation:.45,staining:.15},
 {id:"lamp-black",name:"Lamp Black",ci:"PBk6",colour:"#1d1c20",coefficients:[42.1745,4.22613,.548386,-7.40179,1.12262,1.58323,1.65886,0],granulation:.2,staining:.4},
 {id:"white-gouache",name:"White Gouache",ci:"PW6",colour:"#f7f5ef",coefficients:[0,0,0,0,0,0,0,1],granulation:0,staining:0}
];
