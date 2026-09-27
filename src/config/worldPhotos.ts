/**
 * 3D 画廊展示的精修照片（原图 ~/Desktop/精修_副本，文件名即位置名；缩到长边 1600 / 760 两档）。
 * small 用于户外画架这类小尺寸画框，减少手机显存占用。
 */
export type WorldPhoto = { readonly src: string; readonly small: string; readonly w: number; readonly h: number };

export const WORLD_PHOTOS: readonly WorldPhoto[] = [
  { src: "/photos/world/p01.jpg", small: "/photos/world/s/p01.jpg", w: 1200, h: 1600 }, //  1  后墙左.jpg
  { src: "/photos/world/p02.jpg", small: "/photos/world/s/p02.jpg", w: 1200, h: 1600 }, //  2  后墙右.jpg
  { src: "/photos/world/p03.jpg", small: "/photos/world/s/p03.jpg", w: 1200, h: 1600 }, //  3  舞台左.jpg
  { src: "/photos/world/p04.jpg", small: "/photos/world/s/p04.jpg", w: 1200, h: 1600 }, //  4  舞台右.jpg
  { src: "/photos/world/p05.jpg", small: "/photos/world/s/p05.jpg", w: 1200, h: 1600 }, //  5  左墙1.jpg
  { src: "/photos/world/p06.jpg", small: "/photos/world/s/p06.jpg", w: 1200, h: 1600 }, //  6  左墙2.jpg
  { src: "/photos/world/p07.jpg", small: "/photos/world/s/p07.jpg", w: 1200, h: 1600 }, //  7  左墙3.jpg
  { src: "/photos/world/p08.jpg", small: "/photos/world/s/p08.jpg", w: 1200, h: 1600 }, //  8  左墙4.jpg
  { src: "/photos/world/p09.jpg", small: "/photos/world/s/p09.jpg", w: 1200, h: 1600 }, //  9  左墙5.jpg
  { src: "/photos/world/p10.jpg", small: "/photos/world/s/p10.jpg", w: 1200, h: 1600 }, // 10  左墙6.jpg
  { src: "/photos/world/p11.jpg", small: "/photos/world/s/p11.jpg", w: 1200, h: 1600 }, // 11  左墙7.jpg
  { src: "/photos/world/p12.jpg", small: "/photos/world/s/p12.jpg", w: 1200, h: 1600 }, // 12  左墙8.jpg
  { src: "/photos/world/p13.jpg", small: "/photos/world/s/p13.jpg", w: 1200, h: 1600 }, // 13  右墙1.jpg
  { src: "/photos/world/p14.jpg", small: "/photos/world/s/p14.jpg", w: 1200, h: 1600 }, // 14  右墙2.jpg
  { src: "/photos/world/p15.jpg", small: "/photos/world/s/p15.jpg", w: 1200, h: 1600 }, // 15  右墙3.jpg
  { src: "/photos/world/p16.jpg", small: "/photos/world/s/p16.jpg", w: 1200, h: 1600 }, // 16  右墙4.jpg
  { src: "/photos/world/p17.jpg", small: "/photos/world/s/p17.jpg", w: 1200, h: 1600 }, // 17  右墙5.jpg
  { src: "/photos/world/p18.jpg", small: "/photos/world/s/p18.jpg", w: 1200, h: 1600 }, // 18  右墙6.jpg
  { src: "/photos/world/p19.jpg", small: "/photos/world/s/p19.jpg", w: 1600, h: 1239 }, // 19  右墙7.jpg
  { src: "/photos/world/p20.jpg", small: "/photos/world/s/p20.jpg", w: 1200, h: 1600 }, // 20  右墙8.jpg
  { src: "/photos/world/p21.jpg", small: "/photos/world/s/p21.jpg", w: 1200, h: 1600 }, // 21  草坪1.jpg
  { src: "/photos/world/p22.jpg", small: "/photos/world/s/p22.jpg", w: 1200, h: 1600 }, // 22  草坪2.jpg
  { src: "/photos/world/p23.jpg", small: "/photos/world/s/p23.jpg", w: 1200, h: 1600 }, // 23  草坪3.jpg
  { src: "/photos/world/p24.jpg", small: "/photos/world/s/p24.jpg", w: 1200, h: 1600 }, // 24  草坪4.jpg
  { src: "/photos/world/p25.jpg", small: "/photos/world/s/p25.jpg", w: 1200, h: 1600 }, // 25  草坪5.jpg
  { src: "/photos/world/p26.jpg", small: "/photos/world/s/p26.jpg", w: 1200, h: 1600 }, // 26  草坪6.jpg
  { src: "/photos/world/p27.jpg", small: "/photos/world/s/p27.jpg", w: 1200, h: 1600 }, // 27  草坪7.jpg
  { src: "/photos/world/p28.jpg", small: "/photos/world/s/p28.jpg", w: 1200, h: 1600 }, // 28  草坪8.jpg
  { src: "/photos/world/p29.jpg", small: "/photos/world/s/p29.jpg", w: 1600, h: 1200 }, // 29  草坪9.jpg
  { src: "/photos/world/p30.jpg", small: "/photos/world/s/p30.jpg", w: 1600, h: 1200 }, // 30  草坪10.jpg
  { src: "/photos/world/p31.jpg", small: "/photos/world/s/p31.jpg", w: 1200, h: 1600 }, // 31  草坪11.jpg
  { src: "/photos/world/p32.jpg", small: "/photos/world/s/p32.jpg", w: 1125, h: 1600 }, // 32  草坪12.jpg
  { src: "/photos/world/p33.jpg", small: "/photos/world/s/p33.jpg", w: 1207, h: 1600 }, // 33  草坪13.jpg
  { src: "/photos/world/p34.jpg", small: "/photos/world/s/p34.jpg", w: 1200, h: 1600 }, // 34  草坪14.jpg
  { src: "/photos/world/p35.jpg", small: "/photos/world/s/p35.jpg", w: 1200, h: 1600 }, // 35  7.1_0256.jpg
  { src: "/photos/world/p36.jpg", small: "/photos/world/s/p36.jpg", w: 1200, h: 1600 }, // 36  CP4.jpg
  { src: "/photos/world/p37.jpg", small: "/photos/world/s/p37.jpg", w: 1200, h: 1600 }, // 37  DSCF4935.jpg
  { src: "/photos/world/p38.jpg", small: "/photos/world/s/p38.jpg", w: 1200, h: 1600 }, // 38  DSCF5011.jpg
  { src: "/photos/world/p39.jpg", small: "/photos/world/s/p39.jpg", w: 1600, h: 1200 }, // 39  DSCF5038.jpg
  { src: "/photos/world/p40.jpg", small: "/photos/world/s/p40.jpg", w: 1600, h: 1200 }, // 40  DSCF5151_(2) 拷贝.jpg
  { src: "/photos/world/p41.jpg", small: "/photos/world/s/p41.jpg", w: 1200, h: 1600 }, // 41  DSCF5177.jpg
];

/**
 * 画框位置 → 照片编号（上面列表的序号，从 1 开始），改数字即可换照片。
 * 左右以「进门面朝仪式台」为准；左墙/右墙从门口往里数 1~8；舞台左 / 舞台右 是仪式台前红毯两侧金花瓮后的画架。
 * 草坪1~10、沙滩1~10 是出门后小径/木栈道两侧的画架，从门口往外、每对先左后右（左右以出门面朝前方为准）；
 * 11~14 是舞台两侧：11 左前、12 左后、13 右前、14 右后。
 * 后墙两张是整墙高的竖幅，放横版照片会被裁掉两边。
 * 地址栏加 ?slots 可在 3D 场景里看到每个画框的位置名。
 */
export const PHOTO_LAYOUT: Readonly<Record<string, number>> = {
  后墙左: 1,
  后墙右: 2,
  舞台左: 3,
  舞台右: 4,
  左墙1: 5,
  左墙2: 6,
  左墙3: 7,
  左墙4: 8,
  左墙5: 9,
  左墙6: 10,
  左墙7: 11,
  左墙8: 12,
  右墙1: 13,
  右墙2: 14,
  右墙3: 15,
  右墙4: 16,
  右墙5: 17,
  右墙6: 18,
  右墙7: 19,
  右墙8: 20,
  草坪1: 21,
  草坪2: 22,
  草坪3: 23,
  草坪4: 24,
  草坪5: 25,
  草坪6: 26,
  草坪7: 27,
  草坪8: 28,
  草坪9: 29,
  草坪10: 30,
  草坪11: 31,
  草坪12: 32,
  草坪13: 33,
  草坪14: 34,
  沙滩1: 21, // 同草坪1
  沙滩2: 22, // 同草坪2
  沙滩3: 23, // 同草坪3
  沙滩4: 24, // 同草坪4
  沙滩5: 25, // 同草坪5
  沙滩6: 26, // 同草坪6
  沙滩7: 27, // 同草坪7
  沙滩8: 28, // 同草坪8
  沙滩9: 29, // 同草坪9
  沙滩10: 30, // 同草坪10
  沙滩11: 31, // 同草坪11
  沙滩12: 32, // 同草坪12
  沙滩13: 33, // 同草坪13
  沙滩14: 34, // 同草坪14
};
