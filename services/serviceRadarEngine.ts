import {
  ServiceAlertItem,
  ServicePointZone,
  ServiceAlertCategory,
  TrafficNode,
  UserPreferences,
} from '../types';
import { DOPUNSKI_GAZETTEER } from './gazetteerDopuna';

export interface GazetteerEntry {
  naziv: string;
  tip: string;
  opstina: string;
  naselje: string;
  lat: number;
  lon: number;
  bbox: number[]; // [jug, sever, zapad, istok]
  duzinaM: number;
  duga: boolean;
  osmNaziv: string;
  aliases?: string[];
}

export interface EdsOutageRow {
  datum: string;
  opstina: string;
  od: string;
  do: string;
  naselje: string;
  ulica: string;
  brojevi: string;
  ulicaCir: string;
  izvor: string;
}

// Read-only Gazetteer imported from audio-vesti/recnik.csv (61 verified OSM locations)
// plus key Belgrade bridge/boulevard anchors and DOPUNSKI_GAZETTEER for live service feeds.
export const GAZETTEER_RECNIK: GazetteerEntry[] = [
  {
    "naziv": "Vitanovacka",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7782471,
    "lon": 20.4783047,
    "bbox": [
      44.7775325,
      44.7789117,
      20.4743572,
      20.4841511
    ],
    "duzinaM": 789,
    "duga": false,
    "osmNaziv": "Витановачка"
  },
  {
    "naziv": "Endija Vorhola",
    "tip": "ulica",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.7686277,
    "lon": 20.4114701,
    "bbox": [
      44.7648901,
      44.7778517,
      20.4006549,
      20.4132661
    ],
    "duzinaM": 1754,
    "duga": true,
    "osmNaziv": "Ендија Ворхола"
  },
  {
    "naziv": "Kneza Viseslava",
    "tip": "ulica",
    "opstina": "Čukarica",
    "naselje": "",
    "lat": 44.7655079,
    "lon": 20.4295002,
    "bbox": [
      44.7452861,
      44.7807076,
      20.4227418,
      20.4373892
    ],
    "duzinaM": 4110,
    "duga": true,
    "osmNaziv": "Кнеза Вишеслава"
  },
  {
    "naziv": "Sremcica",
    "tip": "naselje",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.6719378,
    "lon": 20.3954404,
    "bbox": [
      44.6413081,
      44.7044465,
      20.3628309,
      20.432937
    ],
    "duzinaM": 8956,
    "duga": false,
    "osmNaziv": "Сремчица"
  },
  {
    "naziv": "Backa",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8457334,
    "lon": 20.3794633,
    "bbox": [
      44.8431864,
      44.8489612,
      20.3788602,
      20.3816919
    ],
    "duzinaM": 681,
    "duga": false,
    "osmNaziv": "Бачка"
  },
  {
    "naziv": "Bogoljuba Urosevica-Crnog",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Urovci",
    "lat": 44.671896,
    "lon": 20.1519088,
    "bbox": [
      44.6658981,
      44.6767229,
      20.1471957,
      20.1638404
    ],
    "duzinaM": 1786,
    "duga": true,
    "osmNaziv": "Богољуба Урошевића Црног"
  },
  {
    "naziv": "Boljevci",
    "tip": "naselje",
    "opstina": "Градска општина Сурчин",
    "naselje": "",
    "lat": 44.7225323,
    "lon": 20.2165034,
    "bbox": [
      44.6614952,
      44.7683719,
      20.1704871,
      20.3062958
    ],
    "duzinaM": 16030,
    "duga": false,
    "osmNaziv": "Бољевци"
  },
  {
    "naziv": "Brestanska",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Urovci",
    "lat": 44.6703582,
    "lon": 20.171559,
    "bbox": [
      44.6672886,
      44.6720449,
      20.1640839,
      20.1781256
    ],
    "duzinaM": 1231,
    "duga": false,
    "osmNaziv": "Брештанска"
  },
  {
    "naziv": "Bulevar Nikole Tesle",
    "tip": "ulica",
    "opstina": "Београд | Градска општина Земун",
    "naselje": "",
    "lat": 44.8240481,
    "lon": 20.4230361,
    "bbox": [
      44.8177526,
      44.8335776,
      20.4175262,
      20.4372656
    ],
    "duzinaM": 2352,
    "duga": true,
    "osmNaziv": "Булевар Николе Тесле"
  },
  {
    "naziv": "Bulevar patrijarha Pavla",
    "tip": "ulica",
    "opstina": "Београд | Градска општина Раковица",
    "naselje": "",
    "lat": 44.7679024,
    "lon": 20.4420487,
    "bbox": [
      44.7584439,
      44.7808724,
      20.4378045,
      20.4460896
    ],
    "duzinaM": 2581,
    "duga": true,
    "osmNaziv": "Булевар патријарха Павла"
  },
  {
    "naziv": "Cara Lazara",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6478753,
    "lon": 20.1902651,
    "bbox": [
      44.6436077,
      44.6501616,
      20.1841735,
      20.1923646
    ],
    "duzinaM": 976,
    "duga": false,
    "osmNaziv": "Цара Лазара"
  },
  {
    "naziv": "Celopecka",
    "tip": "ulica",
    "opstina": "Zvezdara",
    "naselje": "",
    "lat": 44.8057345,
    "lon": 20.480541,
    "bbox": [
      44.8053346,
      44.8061344,
      20.4799764,
      20.4811056
    ],
    "duzinaM": 126,
    "duga": false,
    "osmNaziv": "Челопечка"
  },
  {
    "naziv": "Danijelova",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7832762,
    "lon": 20.4782773,
    "bbox": [
      44.7805402,
      44.7848869,
      20.4767226,
      20.4800862
    ],
    "duzinaM": 552,
    "duga": false,
    "osmNaziv": "Данијелова"
  },
  {
    "naziv": "Djackog Bataljona",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6484369,
    "lon": 20.1875785,
    "bbox": [
      44.6439977,
      44.6530681,
      20.1832859,
      20.1916639
    ],
    "duzinaM": 1208,
    "duga": false,
    "osmNaziv": "Ђачког батаљона"
  },
  {
    "naziv": "Husova",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7837641,
    "lon": 20.4808482,
    "bbox": [
      44.7834887,
      44.7841293,
      20.4800461,
      20.4816822
    ],
    "duzinaM": 148,
    "duga": false,
    "osmNaziv": "Хусова"
  },
  {
    "naziv": "Industrijska",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6614513,
    "lon": 20.1762489,
    "bbox": [
      44.658151,
      44.6670028,
      20.174882,
      20.1790376
    ],
    "duzinaM": 1039,
    "duga": false,
    "osmNaziv": "Индустријска"
  },
  {
    "naziv": "Ivankovacka",
    "tip": "ulica",
    "opstina": "Градска општина Палилула",
    "naselje": "",
    "lat": 44.8073361,
    "lon": 20.4786112,
    "bbox": [
      44.8068876,
      44.8077903,
      20.4778544,
      20.4793645
    ],
    "duzinaM": 156,
    "duga": false,
    "osmNaziv": "Иванковачка"
  },
  {
    "naziv": "Karlovacka",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.852845,
    "lon": 20.3856268,
    "bbox": [
      44.8500529,
      44.8540168,
      20.3851545,
      20.3858233
    ],
    "duzinaM": 444,
    "duga": false,
    "osmNaziv": "Звонка Миленковића"
  },
  {
    "naziv": "Kirovljeva",
    "tip": "ulica",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.785979,
    "lon": 20.4178557,
    "bbox": [
      44.7822381,
      44.7888318,
      20.4169794,
      20.4203533
    ],
    "duzinaM": 781,
    "duga": false,
    "osmNaziv": "Кировљева"
  },
  {
    "naziv": "Knezevacka",
    "tip": "ulica",
    "opstina": "Градска општина Раковица",
    "naselje": "",
    "lat": 44.7356631,
    "lon": 20.4288222,
    "bbox": [
      44.7343636,
      44.7368252,
      20.4264117,
      20.4304168
    ],
    "duzinaM": 419,
    "duga": false,
    "osmNaziv": "Кнежевачка"
  },
  {
    "naziv": "kralja Vladimira",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7805147,
    "lon": 20.4745588,
    "bbox": [
      44.7779601,
      44.7820388,
      20.4721286,
      20.47588
    ],
    "duzinaM": 542,
    "duga": false,
    "osmNaziv": "Краља Владимира"
  },
  {
    "naziv": "Kumodraska",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7765585,
    "lon": 20.4811762,
    "bbox": [
      44.7713727,
      44.7839269,
      20.476027,
      20.483762
    ],
    "duzinaM": 1525,
    "duga": true,
    "osmNaziv": "Кумодрашка"
  },
  {
    "naziv": "Lazarevac",
    "tip": "naselje",
    "opstina": "Градска општина Лазаревац",
    "naselje": "",
    "lat": 44.3815176,
    "lon": 20.261033,
    "bbox": [
      44.3551241,
      44.4035172,
      20.2302987,
      20.3336529
    ],
    "duzinaM": 9831,
    "duga": false,
    "osmNaziv": "Лазаревац"
  },
  {
    "naziv": "Ljeska",
    "tip": "ulica",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.7830504,
    "lon": 20.4151725,
    "bbox": [
      44.774188,
      44.7856075,
      20.4113857,
      20.4178036
    ],
    "duzinaM": 1369,
    "duga": false,
    "osmNaziv": "Љешка"
  },
  {
    "naziv": "Ljube Nedica",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7849987,
    "lon": 20.4756555,
    "bbox": [
      44.7848869,
      44.785089,
      20.474582,
      20.4767358
    ],
    "duzinaM": 172,
    "duga": false,
    "osmNaziv": "Љубе Недића"
  },
  {
    "naziv": "Ljube Nenadovica",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6522918,
    "lon": 20.1934636,
    "bbox": [
      44.6515889,
      44.6529939,
      20.1931814,
      20.193744
    ],
    "duzinaM": 163,
    "duga": false,
    "osmNaziv": "Љубе Ненадовића"
  },
  {
    "naziv": "Ljubice Ivosevic Dimitrov",
    "tip": "ulica",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.7510049,
    "lon": 20.420334,
    "bbox": [
      44.7496988,
      44.7544327,
      20.4200445,
      20.4231322
    ],
    "duzinaM": 581,
    "duga": false,
    "osmNaziv": "Љубице Ивошевић-Димитров"
  },
  {
    "naziv": "Lovacka",
    "tip": "ulica",
    "opstina": "Surčin",
    "naselje": "Dobanovci",
    "lat": 44.8167761,
    "lon": 20.2248317,
    "bbox": [
      44.8160176,
      44.8168805,
      20.2173513,
      20.2322566
    ],
    "duzinaM": 1181,
    "duga": false,
    "osmNaziv": "Ловачка"
  },
  {
    "naziv": "Majdanska",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Urovci",
    "lat": 44.6615744,
    "lon": 20.148447,
    "bbox": [
      44.6605001,
      44.6661003,
      20.143893,
      20.1614604
    ],
    "duzinaM": 1524,
    "duga": true,
    "osmNaziv": "Мајданска"
  },
  {
    "naziv": "Maruliceva",
    "tip": "ulica",
    "opstina": "Градска општина Врачар",
    "naselje": "",
    "lat": 44.7949349,
    "lon": 20.4795416,
    "bbox": [
      44.7948228,
      44.7950378,
      20.4781322,
      20.4809518
    ],
    "duzinaM": 224,
    "duga": false,
    "osmNaziv": "Марулићева"
  },
  {
    "naziv": "Mostarska",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8516463,
    "lon": 20.3822458,
    "bbox": [
      44.8502373,
      44.8552855,
      20.3817446,
      20.3826181
    ],
    "duzinaM": 566,
    "duga": false,
    "osmNaziv": "Мостарска"
  },
  {
    "naziv": "Nadezde Petrovic",
    "tip": "ulica",
    "opstina": "Surčin",
    "naselje": "Dobanovci",
    "lat": 44.8188864,
    "lon": 20.2230922,
    "bbox": [
      44.8168767,
      44.8203558,
      20.2224629,
      20.2247609
    ],
    "duzinaM": 428,
    "duga": false,
    "osmNaziv": "Надежде Петровић"
  },
  {
    "naziv": "Nemanjina",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6677214,
    "lon": 20.1900488,
    "bbox": [
      44.6633945,
      44.6690831,
      20.1821758,
      20.2009022
    ],
    "duzinaM": 1612,
    "duga": true,
    "osmNaziv": "Немањина"
  },
  {
    "naziv": "Omladinska",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6472257,
    "lon": 20.181867,
    "bbox": [
      44.6472041,
      44.6476975,
      20.1802593,
      20.1834596
    ],
    "duzinaM": 259,
    "duga": false,
    "osmNaziv": "Омладинска"
  },
  {
    "naziv": "Palilula",
    "tip": "naselje",
    "opstina": "Градска општина Палилула",
    "naselje": "",
    "lat": 44.8115007,
    "lon": 20.4782946,
    "bbox": [
      44.8014701,
      44.8897047,
      20.4594505,
      20.6232109
    ],
    "duzinaM": 16234,
    "duga": false,
    "osmNaziv": "Београд (Палилула)"
  },
  {
    "naziv": "Pere Cetkovica",
    "tip": "ulica",
    "opstina": "Градска општина Палилула",
    "naselje": "",
    "lat": 44.8081058,
    "lon": 20.5192065,
    "bbox": [
      44.8052334,
      44.8096526,
      20.5126983,
      20.5248685
    ],
    "duzinaM": 1080,
    "duga": false,
    "osmNaziv": "Пера Ћетковића"
  },
  {
    "naziv": "Porucnika Spasica i Masere",
    "tip": "ulica",
    "opstina": "Čukarica",
    "naselje": "Zarkovo",
    "lat": 44.7658606,
    "lon": 20.4099143,
    "bbox": [
      44.7593958,
      44.7692813,
      20.4089892,
      20.4126391
    ],
    "duzinaM": 1138,
    "duga": false,
    "osmNaziv": "Поручника Спасића и Машере"
  },
  {
    "naziv": "Posavskih Norvezana",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6337157,
    "lon": 20.178369,
    "bbox": [
      44.6231868,
      44.6530988,
      20.1738454,
      20.1916639
    ],
    "duzinaM": 3617,
    "duga": true,
    "osmNaziv": "Ђачког батаљона"
  },
  {
    "naziv": "Prizrenska",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8524089,
    "lon": 20.3843963,
    "bbox": [
      44.8507445,
      44.8540776,
      20.3841556,
      20.3846037
    ],
    "duzinaM": 373,
    "duga": false,
    "osmNaziv": "Призренска"
  },
  {
    "naziv": "Sarajevska",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8506037,
    "lon": 20.3809958,
    "bbox": [
      44.8499224,
      44.8512903,
      20.3808616,
      20.3811469
    ],
    "duzinaM": 154,
    "duga": false,
    "osmNaziv": "Сарајевска"
  },
  {
    "naziv": "Sremskih Boraca",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.847745,
    "lon": 20.3806855,
    "bbox": [
      44.8465703,
      44.8492593,
      20.3790704,
      20.3816425
    ],
    "duzinaM": 362,
    "duga": false,
    "osmNaziv": "Сремских бораца"
  },
  {
    "naziv": "Trg Slavija",
    "tip": "ulica",
    "opstina": "Градска општина Врачар",
    "naselje": "",
    "lat": 44.8022889,
    "lon": 20.4665927,
    "bbox": [
      44.8022225,
      44.8027378,
      20.4659524,
      20.4666946
    ],
    "duzinaM": 82,
    "duga": false,
    "osmNaziv": "Трг Славија"
  },
  {
    "naziv": "Tuzlanska",
    "tip": "ulica",
    "opstina": "Градска општина Раковица",
    "naselje": "",
    "lat": 44.7217059,
    "lon": 20.4252262,
    "bbox": [
      44.7212246,
      44.7240852,
      20.4200699,
      20.4272828
    ],
    "duzinaM": 653,
    "duga": false,
    "osmNaziv": "Тузланска"
  },
  {
    "naziv": "Ugrinovacka",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8488771,
    "lon": 20.3926406,
    "bbox": [
      44.842898,
      44.8502378,
      20.3730298,
      20.4045247
    ],
    "duzinaM": 2617,
    "duga": true,
    "osmNaziv": "Угриновачка"
  },
  {
    "naziv": "Urovacka",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Urovci",
    "lat": 44.6671545,
    "lon": 20.1483992,
    "bbox": [
      44.6592601,
      44.6720459,
      20.1346637,
      20.1517618
    ],
    "duzinaM": 1964,
    "duga": true,
    "osmNaziv": "Уровачка"
  },
  {
    "naziv": "Urovci",
    "tip": "naselje",
    "opstina": "Градска општина Обреновац",
    "naselje": "",
    "lat": 44.6645815,
    "lon": 20.139345,
    "bbox": [
      44.6351782,
      44.6798335,
      20.1186579,
      20.1825679
    ],
    "duzinaM": 7094,
    "duga": false,
    "osmNaziv": "Уровци"
  },
  {
    "naziv": "Vjekoslava Kovaca",
    "tip": "ulica",
    "opstina": "Градска општина Звездара",
    "naselje": "",
    "lat": 44.7934685,
    "lon": 20.5083238,
    "bbox": [
      44.7929859,
      44.794297,
      20.5039211,
      20.5111109
    ],
    "duzinaM": 586,
    "duga": false,
    "osmNaziv": "Вјекослава Ковача"
  },
  {
    "naziv": "Vojvode Misica",
    "tip": "ulica",
    "opstina": "Obrenovac",
    "naselje": "Obrenovac",
    "lat": 44.6539502,
    "lon": 20.1867337,
    "bbox": [
      44.6529917,
      44.6549059,
      20.1783521,
      20.2000418
    ],
    "duzinaM": 1731,
    "duga": true,
    "osmNaziv": "Војводе Мишића"
  },
  {
    "naziv": "vojvode Skopljanca",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7826905,
    "lon": 20.4798198,
    "bbox": [
      44.7816795,
      44.7837101,
      20.4792916,
      20.48031
    ],
    "duzinaM": 240,
    "duga": false,
    "osmNaziv": "Војводе Скопљанца"
  },
  {
    "naziv": "Zadrugarska",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8494306,
    "lon": 20.3824921,
    "bbox": [
      44.8486281,
      44.8502373,
      20.3823355,
      20.3826181
    ],
    "duzinaM": 181,
    "duga": false,
    "osmNaziv": "Задругарска"
  },
  {
    "naziv": "Zagorska",
    "tip": "ulica",
    "opstina": "Zemun",
    "naselje": "",
    "lat": 44.8461837,
    "lon": 20.3829438,
    "bbox": [
      44.8459628,
      44.8479155,
      20.3806068,
      20.3840573
    ],
    "duzinaM": 348,
    "duga": false,
    "osmNaziv": "Благоја Јововића"
  },
  {
    "naziv": "Zeleznik",
    "tip": "naselje",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.7286015,
    "lon": 20.3750086,
    "bbox": [
      44.6984458,
      44.757577,
      20.3401403,
      20.4159522
    ],
    "duzinaM": 8904,
    "duga": false,
    "osmNaziv": "Железник"
  },
  {
    "naziv": "Branicevska",
    "tip": "ulica",
    "opstina": "Градска општина Врачар",
    "naselje": "",
    "lat": 44.7946018,
    "lon": 20.4694569,
    "bbox": [
      44.792503,
      44.7992115,
      20.4687633,
      20.4700963
    ],
    "duzinaM": 754,
    "duga": false,
    "osmNaziv": "Боре Станковића"
  },
  {
    "naziv": "Brankova",
    "tip": "ulica",
    "opstina": "Београд",
    "naselje": "",
    "lat": 44.8151854,
    "lon": 20.4532411,
    "bbox": [
      44.8145675,
      44.8153032,
      20.4514646,
      20.4561514
    ],
    "duzinaM": 379,
    "duga": false,
    "osmNaziv": "Бранкова"
  },
  {
    "naziv": "kneza Bogosava",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7806415,
    "lon": 20.4824014,
    "bbox": [
      44.7805052,
      44.7807957,
      20.4810141,
      20.4837889
    ],
    "duzinaM": 222,
    "duga": false,
    "osmNaziv": "Кнеза Богосава"
  },
  {
    "naziv": "Kraljice Marije",
    "tip": "ulica",
    "opstina": "Градска општина Врачар | Градска општина Звездара | Градска општина Палилула",
    "naselje": "",
    "lat": 44.8056888,
    "lon": 20.4788946,
    "bbox": [
      44.8034137,
      44.8081597,
      20.4766619,
      20.4801722
    ],
    "duzinaM": 597,
    "duga": false,
    "osmNaziv": "Краљице Марије"
  },
  {
    "naziv": "Ljubicka",
    "tip": "ulica",
    "opstina": "Градска општина Вождовац",
    "naselje": "",
    "lat": 44.7836664,
    "lon": 20.4791454,
    "bbox": [
      44.7834115,
      44.7851486,
      20.4781611,
      20.4811741
    ],
    "duzinaM": 307,
    "duga": false,
    "osmNaziv": "Љубићка"
  },
  {
    "naziv": "Sandzacka",
    "tip": "ulica",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.754321,
    "lon": 20.4201207,
    "bbox": [
      44.7502874,
      44.7552879,
      20.4182853,
      20.4223982
    ],
    "duzinaM": 645,
    "duga": false,
    "osmNaziv": "Санџачка"
  },
  {
    "naziv": "Skerliceva",
    "tip": "ulica",
    "opstina": "Градска општина Врачар",
    "naselje": "",
    "lat": 44.796861,
    "lon": 20.4678012,
    "bbox": [
      44.7967657,
      44.7969477,
      20.4662251,
      20.4693689
    ],
    "duzinaM": 249,
    "duga": false,
    "osmNaziv": "Скерлићева"
  },
  {
    "naziv": "Stevana Filipovica",
    "tip": "ulica",
    "opstina": "Градска општина Чукарица",
    "naselje": "",
    "lat": 44.7227267,
    "lon": 20.3615871,
    "bbox": [
      44.7094186,
      44.7264031,
      20.3606569,
      20.3701866
    ],
    "duzinaM": 2035,
    "duga": true,
    "osmNaziv": "Стевана Филиповића"
  },
  {
    "naziv": "Trg Republike",
    "tip": "ulica",
    "opstina": "Београд",
    "naselje": "",
    "lat": 44.8163299,
    "lon": 20.4606172,
    "bbox": [
      44.8159066,
      44.8167703,
      20.4601344,
      20.4611344
    ],
    "duzinaM": 124,
    "duga": false,
    "osmNaziv": "Трг републике"
  },
  {
    naziv: 'Bulevar despota Stefana',
    tip: 'ulica',
    opstina: 'Palilula | Stari grad',
    naselje: 'Beograd',
    lat: 44.8172,
    lon: 20.4748,
    bbox: [44.8142, 44.8215, 20.4625, 20.4882],
    duzinaM: 2150,
    duga: true,
    osmNaziv: 'Булевар деспота Стефана',
    aliases: ['29. novembra', 'Despota Stefana'],
  },
  {
    naziv: 'Bulevar Mihajla Pupina',
    tip: 'ulica',
    opstina: 'Novi Beograd',
    naselje: 'Novi Beograd',
    lat: 44.8186,
    lon: 20.4292,
    bbox: [44.8145, 44.8245, 20.4112, 20.4455],
    duzinaM: 2400,
    duga: true,
    osmNaziv: 'Булевар Михајла Пупина',
    aliases: ['Mihajla Pupina', 'SIV', 'Palata Srbija', 'Ušće'],
  },
  {
    naziv: 'Brankov most',
    tip: 'most',
    opstina: 'Novi Beograd | Stari grad',
    naselje: 'Beograd',
    lat: 44.8148,
    lon: 20.4478,
    bbox: [44.8138, 44.8158, 20.4425, 20.4525],
    duzinaM: 450,
    duga: false,
    osmNaziv: 'Бранков мост',
    aliases: ['Brankov most', 'Zeleni venac'],
  },
  {
    naziv: 'Most Gazela',
    tip: 'most',
    opstina: 'Novi Beograd | Savski venac',
    naselje: 'Beograd',
    lat: 44.8019,
    lon: 20.4408,
    bbox: [44.7985, 44.8055, 20.4325, 20.4495],
    duzinaM: 950,
    duga: false,
    osmNaziv: 'Мост Газела',
    aliases: ['Gazela', 'Autoput kroz Beograd', 'Mostarska petlja'],
  },
  {
    naziv: 'Autokomanda',
    tip: 'kvart',
    opstina: 'Voždovac | Savski venac',
    naselje: 'Beograd',
    lat: 44.7897,
    lon: 20.4642,
    bbox: [44.7865, 44.7935, 20.4595, 20.4695],
    duzinaM: 600,
    duga: false,
    osmNaziv: 'Аутокоманда',
    aliases: ['Autokomanda', 'Petlja Autokomanda'],
  },
  {
    naziv: 'Cerska',
    tip: 'ulica',
    opstina: 'Vračar',
    naselje: 'Vračar',
    lat: 44.7938,
    lon: 20.4765,
    bbox: [44.7918, 44.7955, 20.4715, 20.4812],
    duzinaM: 640,
    duga: false,
    osmNaziv: 'Церска',
    aliases: ['Cerska ulica', 'Čubura'],
  },
  {
    naziv: 'Makenzijeva',
    tip: 'ulica',
    opstina: 'Vračar',
    naselje: 'Vračar',
    lat: 44.7992,
    lon: 20.4712,
    bbox: [44.7945, 44.8025, 20.4665, 20.4755],
    duzinaM: 790,
    duga: false,
    osmNaziv: 'Макензијева',
    aliases: ['Čuburski park', 'Slavija'],
  },
  {
    naziv: 'Beogradska',
    tip: 'ulica',
    opstina: 'Vračar',
    naselje: 'Vračar',
    lat: 44.8048,
    lon: 20.4718,
    bbox: [44.8022, 44.8075, 20.4662, 20.4775],
    duzinaM: 880,
    duga: false,
    osmNaziv: 'Београдска',
    aliases: ['Pravni fakultet', 'Tašmajdan'],
  },
  {
    naziv: 'Kneza Miloša',
    tip: 'ulica',
    opstina: 'Savski venac | Vračar',
    naselje: 'Beograd',
    lat: 44.8045,
    lon: 20.4595,
    bbox: [44.7985, 44.8105, 20.4495, 20.4665],
    duzinaM: 1420,
    duga: false,
    osmNaziv: 'Кнеза Милоша',
    aliases: ['Londonski skver', 'Mostar'],
  },
  {
    naziv: 'Dečanska',
    tip: 'ulica',
    opstina: 'Stari grad',
    naselje: 'Centar',
    lat: 44.8138,
    lon: 20.4628,
    bbox: [44.8118, 44.8158, 20.4605, 20.4652],
    duzinaM: 420,
    duga: false,
    osmNaziv: 'Дечанска',
    aliases: ['Terazijski tunel', 'Dom omladine'],
  },
  {
    naziv: 'Egipatska',
    tip: 'ulica',
    opstina: 'Novi Beograd',
    naselje: 'Bežanijska kosa',
    lat: 44.8115,
    lon: 20.3765,
    bbox: [44.8095, 44.8135, 20.3725, 20.3805],
    duzinaM: 520,
    duga: false,
    osmNaziv: 'Египатска',
  },
  {
    naziv: 'Gandijeva',
    tip: 'ulica',
    opstina: 'Novi Beograd',
    naselje: 'Blok 63 | Blok 64',
    lat: 44.8058,
    lon: 20.3865,
    bbox: [44.7985, 44.8125, 20.3815, 20.3915],
    duzinaM: 1380,
    duga: false,
    osmNaziv: 'Гандијева',
  },
  ...DOPUNSKI_GAZETTEER,
];

// Read-only EDS dataset from audio-vesti/eds.csv
export const EDS_PLANNED_OUTAGES: EdsOutageRow[] = [
  {
    "datum": "2026-09-21",
    "opstina": "Rakovica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Koste Živkovića",
    "brojevi": "1-3",
    "ulicaCir": "КОСТЕ ЖИВКОВИЋА",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-21",
    "opstina": "Rakovica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "M Blagojevića Španca",
    "brojevi": "2-6",
    "ulicaCir": "М БЛАГОЈЕВИЋА ШПАНЦА",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-21",
    "opstina": "Rakovica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Srzentićeva",
    "brojevi": "6-8,5-9",
    "ulicaCir": "СРЗЕНТИЋЕВА",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-21",
    "opstina": "Savski Venac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Pivljanina Baja",
    "brojevi": "83,87",
    "ulicaCir": "ПИВЉАНИНА БАЈА",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-21",
    "opstina": "Zemun",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Ugrinovci",
    "ulica": "Beogradska",
    "brojevi": "154-170",
    "ulicaCir": "БЕОГРАДСКА",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-21",
    "opstina": "Zemun",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Ugrinovci",
    "ulica": "Nova 16",
    "brojevi": "1-11",
    "ulicaCir": "НОВА 16",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-21",
    "opstina": "Čukarica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Kneza Višeslava",
    "brojevi": "86 b,88-90",
    "ulicaCir": "КНЕЗА ВИШЕСЛАВА",
    "izvor": "Dan_0"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Baljevački Put",
    "brojevi": "1111",
    "ulicaCir": "БАЉЕВАЧКИ ПУТ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Draževac",
    "ulica": "Beljin Potok",
    "brojevi": "2-18,1-19",
    "ulicaCir": "БЕЉИН ПОТОК",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Cigani",
    "brojevi": "0,110A,114",
    "ulicaCir": "ЦИГАНИ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Dubrovačka",
    "brojevi": "108A,112,116,122A,150,107-109,117A",
    "ulicaCir": "ДУБРОВАЧКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Dubrovački Kraj",
    "brojevi": "40A,108,112-118A,122B,136,140-142,148,113-115,121A-121C,125,131E-131H,143,1111BB",
    "ulicaCir": "ДУБРОВАЧКИ КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Konatice",
    "ulica": "Dumača",
    "brojevi": "29",
    "ulicaCir": "ДУМАЧА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Jankovića Kraj",
    "brojevi": "110A,119B-123C,131B-131F",
    "ulicaCir": "ЈАНКОВИЋА КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Draževac",
    "ulica": "Jelisavčića Kraj",
    "brojevi": "2-8,1-11",
    "ulicaCir": "ЈЕЛИСАВЧИЋА КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Jovanovića Kraj",
    "brojevi": "123,131A",
    "ulicaCir": "ЈОВАНОВИЋА КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Kod Doma",
    "brojevi": "98A-100,104,1,91A,117",
    "ulicaCir": "КОД ДОМА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Maksimovića Kraj",
    "brojevi": "88,91B",
    "ulicaCir": "МАКСИМОВИЋА КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Mijatovića Kraj",
    "brojevi": "2-26,30-36,40-44A,50B,56,62,66-68,78-80,1-33,37,53-55,61-63,69,77-81",
    "ulicaCir": "МИЈАТОВИЋА КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Konatice",
    "ulica": "Mijatovića Kraj 2 Deo",
    "brojevi": "12-14,26-28,273G",
    "ulicaCir": "МИЈАТОВИЋА КРАЈ 2 ДЕО",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Mijatovića Kraj 2.deo",
    "brojevi": "6B,38A-40A,44A,50-50A,64-66A,39,59,75",
    "ulicaCir": "МИЈАТОВИЋА КРАЈ 2.ДЕО",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Nema Naziva Ulice",
    "brojevi": "0,68-70,82,94-96,100,104-106,110-112,120,124-126,130-132,75,89-93,97,103,117-119,127-131,141",
    "ulicaCir": "НЕМА НАЗИВА УЛИЦЕ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Osredak",
    "brojevi": "50A-54B,80-82E,86D,90-92B,96A-96B,106-106D,116G,1A,37A,85B,91A-91B,95-95D,101A",
    "ulicaCir": "ОСРЕДАК",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Draževac",
    "ulica": "Put za Baljevac",
    "brojevi": "2-86,1-9,13-25,29-57,67-111",
    "ulicaCir": "ПУТ ЗА БАЉЕВАЦ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Konatice",
    "ulica": "Put za Baljevac",
    "brojevi": "308D",
    "ulicaCir": "ПУТ ЗА БАЉЕВАЦ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Konatice",
    "ulica": "Put za Vrbovno",
    "brojevi": "35",
    "ulicaCir": "ПУТ ЗА ВРБОВНО",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Srednji Kraj",
    "brojevi": "79,97",
    "ulicaCir": "СРЕДЊИ КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Draževac",
    "ulica": "Vinogradi",
    "brojevi": "2-4,10-12,16-26,30",
    "ulicaCir": "ВИНОГРАДИ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Vranić",
    "brojevi": "378",
    "ulicaCir": "ВРАНИЋ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Škola",
    "brojevi": "0,64A,70,78B,82A-82D,106-106D,116,136,1,51,67,71A,75-77A,95A,99A-101A,117,141",
    "ulicaCir": "ШКОЛА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Obrenovac",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Baljevac",
    "ulica": "Živkovića Kraj",
    "brojevi": "106C",
    "ulicaCir": "ЖИВКОВИЋА КРАЈ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Palilula",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Borča",
    "ulica": "Dvanaestog Oktobra",
    "brojevi": "14-20,29-33",
    "ulicaCir": "ДВАНАЕСТОГ ОКТОБРА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Palilula",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Borča Mali - Zbeg",
    "ulica": "Karlovacke Mitropolije",
    "brojevi": "52-52B,60-62",
    "ulicaCir": "КАРЛОВАЦКЕ МИТРОПОЛИЈЕ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Palilula",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Borča",
    "ulica": "Ranka Miljića",
    "brojevi": "2,6-24,36-44,48-60,1,5-31,41A-63",
    "ulicaCir": "РАНКА МИЉИЋА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Palilula",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Borča",
    "ulica": "Vizeljska",
    "brojevi": "4-12,16-18,22-34A,38-50,1-5,9,13-15,19-27,31-39,43-59",
    "ulicaCir": "ВИЗЕЉСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Palilula",
    "od": "09:00",
    "do": "14:00",
    "naselje": "Borča",
    "ulica": "Zanatska",
    "brojevi": "4-14,1-25",
    "ulicaCir": "ЗАНАТСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Vračar",
    "od": "09:00",
    "do": "15:00",
    "naselje": "",
    "ulica": "Nebojšina",
    "brojevi": "27-31",
    "ulicaCir": "НЕБОЈШИНА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Vračar",
    "od": "09:00",
    "do": "15:00",
    "naselje": "",
    "ulica": "Rankeova",
    "brojevi": "2-2,3",
    "ulicaCir": "РАНКЕОВА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Vračar",
    "od": "09:00",
    "do": "15:00",
    "naselje": "",
    "ulica": "Skerlićeva",
    "brojevi": "2,6-8,12-12A,22",
    "ulicaCir": "СКЕРЛИЋЕВА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Banatska",
    "brojevi": "2-14,22,1-13,21",
    "ulicaCir": "БАНАТСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Bačka",
    "brojevi": "2-20B,1-1U,5D",
    "ulicaCir": "БАЧКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Bački Ilovik",
    "brojevi": "2-8,16-16A,28-36,40-50,68-70,1-9,29-33A,39-51",
    "ulicaCir": "БАЧКИ ИЛОВИК",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Geteova",
    "brojevi": "2,14-24,1-5,19-21",
    "ulicaCir": "ГЕТЕОВА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Pazovački Put",
    "brojevi": "2-16B,1-13",
    "ulicaCir": "ПАЗОВАЧКИ ПУТ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Sarajevska",
    "brojevi": "3-5",
    "ulicaCir": "САРАЈЕВСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Sremskih Boraca",
    "brojevi": "2Ć-2U",
    "ulicaCir": "СРЕМСКИХ БОРАЦА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Ugrinovačka",
    "brojevi": "170-170A,184-210,189-223B",
    "ulicaCir": "УГРИНОВАЧКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Vojni Put 1",
    "brojevi": "2-22,46-48,112,1-23,29-29A,33,43-47,113-113A",
    "ulicaCir": "ВОЈНИ ПУТ 1",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Vojni Put 2",
    "brojevi": "12-16,11-21",
    "ulicaCir": "ВОЈНИ ПУТ 2",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zemun",
    "od": "08:30",
    "do": "12:30",
    "naselje": "",
    "ulica": "Šajkaška",
    "brojevi": "2,1-27",
    "ulicaCir": "ШАЈКАШКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Bana Ivaniša",
    "brojevi": "2-8,12,13-15,19-21,25-27",
    "ulicaCir": "БАНА ИВАНИША",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Bosutska",
    "brojevi": "2-8A,1-7A",
    "ulicaCir": "БОСУТСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Idrijska",
    "brojevi": "2-8,12,1-3",
    "ulicaCir": "ИДРИЈСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Lukijana Mušickog",
    "brojevi": "2-2A,1",
    "ulicaCir": "ЛУКИЈАНА МУШИЦКОГ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "M.mokri Lug",
    "ulica": "Narodnog Fronta",
    "brojevi": "69A",
    "ulicaCir": "НАРОДНОГ ФРОНТА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "V.mokri Lug",
    "ulica": "Nikole Grulovića",
    "brojevi": "71-75A,79",
    "ulicaCir": "НИКОЛЕ ГРУЛОВИЋА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Novice Cerovića",
    "brojevi": "4-18A,1-11A",
    "ulicaCir": "НОВИЦЕ ЦЕРОВИЋА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "M.mokri Lug",
    "ulica": "Partizanska",
    "brojevi": "18-54,27-31,35-37,41-47",
    "ulicaCir": "ПАРТИЗАНСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Voj Sime Popovića",
    "brojevi": "9-11A",
    "ulicaCir": "ВОЈ СИМЕ ПОПОВИЋА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Volgina",
    "brojevi": "12-24V/8,7-9",
    "ulicaCir": "ВОЛГИНА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Zvezdara",
    "od": "08:30",
    "do": "14:00",
    "naselje": "",
    "ulica": "Zvezdarska",
    "brojevi": "2-24,1-17",
    "ulicaCir": "ЗВЕЗДАРСКА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Čukarica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Žarkovo",
    "ulica": "Cerski Venac",
    "brojevi": "2-20,1-23",
    "ulicaCir": "ЦЕРСКИ ВЕНАЦ",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Čukarica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Žarkovo",
    "ulica": "Crvenih Hrastova",
    "brojevi": "2-8,1-5",
    "ulicaCir": "ЦРВЕНИХ ХРАСТОВА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Čukarica",
    "od": "08:30",
    "do": "14:00",
    "naselje": "Žarkovo",
    "ulica": "Lipa",
    "brojevi": "2-10,1-15",
    "ulicaCir": "ЛИПА",
    "izvor": "Dan_1"
  },
  {
    "datum": "2026-09-22",
    "opstina": "Čukarica",
    "od": "10:00",
    "do": "12:00",
    "naselje": "",
    "ulica": "Ada Ciganlija",
    "brojevi": "BB,bb,BB,BB,BB,BB,BB,BB,BB,BB,BB,BB,BB,BB,BB,BB,2D,1D",
    "ulicaCir": "АДА ЦИГАНЛИЈА",
    "izvor": "Dan_1"
  }
];

// Direct GSP / BVK / Grad Beograd active service items based on audio-vesti findings (2.3, 3.4, 5.4)
export interface DirectServiceRecord {
  id: string;
  category: ServiceAlertCategory;
  opstina: string;
  ulica: string;
  brojevi?: string;
  timeWindow: string;
  transitLines?: string[];
  isForecast?: boolean;
  urgencyLevel: 1 | 2 | 3;
  lat?: number;
  lng?: number;
  sourceName: string;
  rawSummary: string;
  url: string;
}

// Hardcoded demo records (including fake parking garages) have been removed so only real scraped data from servisi.json runs.
export const ACTIVE_DIRECT_SERVICE_RECORDS: DirectServiceRecord[] = [];

// ==================================================== NORMALIZACIJA I PADEŽI (po audio-vesti/eds_kandidati.py & izveštaju 4.1)

const CIRILICA_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj',
  е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

export function kljuc(s?: string): string {
  if (!s) return '';
  let out = s.toLowerCase();
  out = Array.from(out)
    .map((ch) => CIRILICA_MAP[ch] ?? ch)
    .join('')
    .replace(/đ/g, 'dj')
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z');
  out = out.replace(/\([^)]*\)/g, ' ');
  out = out.replace(/\b(?:prvi|drugi|treci|cetvrti|\d+)\.?\s*deo\b.*$/g, ' ');
  out = out.replace(/\bbul\b\.?\s*/g, 'bulevar ');
  out = out.replace(/\bvoj\b\.?\s*/g, 'vojvode ');
  out = out.replace(/\bkralj\b\.?\s*/g, 'kralja ');
  out = out.replace(/\bknj\b\.?\s*/g, 'kneginje ');
  out = out.replace(/[^a-z0-9\s]/g, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

export function srediUlicuEds(naziv: string): string {
  let n = (naziv || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:prvi|drugi|treci|cetvrti|\d+)\.?\s*deo\b.*$/i, ' ')
    .replace(/(?<=\w)-(?=\w)/g, ' ')
    .trim();
  const poceci: Array<[RegExp, string]> = [
    [/^Voj\.?\s+/i, 'Vojvode '],
    [/^Bul\.?\s+/i, 'Bulevar '],
    [/^Kralj\.?\s+/i, 'Kralja '],
    [/^Knj\.?\s+/i, 'Kneginje '],
    [/^Dr\.?\s+/i, 'Doktora '],
    [/^Sv\.?\s+/i, 'Svetog '],
  ];
  for (const [rx, zamena] of poceci) {
    n = n.replace(rx, zamena);
  }
  n = n.replace(/^[A-ZČĆŽŠĐ]\.?\s+(?=\w{3,})/, '');
  return n.replace(/\s+/g, ' ').trim();
}

/**
 * Vraća ispravan srpski lokativ za opštinu (Stefanova odluka 4.1: "u Paliluli", "na Vračaru", "u Zemunu")
 */
export function opstinaULokativu(opstinaRaw?: string): string {
  const first = (opstinaRaw || '').split('|')[0].trim();
  const k = kljuc(first);
  if (!k) return 'u Beogradu';
  if (k.includes('vracar')) return 'na Vračaru';
  if (k.includes('vozdovac')) return 'na Voždovcu';
  if (k.includes('zvezdar')) return 'na Zvezdari';
  if (k.includes('cukarica')) return 'na Čukarici';
  if (k.includes('palilul')) return 'na Paliluli';
  if (k.includes('novi beograd')) return 'na Novom Beogradu';
  if (k.includes('savski venac')) return 'na Savskom vencu';
  if (k.includes('stari grad')) return 'na Starom gradu';
  if (k.includes('zemun')) return 'u Zemunu';
  if (k.includes('rakovic')) return 'u Rakovici';
  if (k.includes('surcin')) return 'u Surčinu';
  if (k.includes('obrenovac')) return 'u Obrenovcu';
  return `u opštini ${first}`;
}

/**
 * Vraća ulicu u prirodnom govornom lokativu + narodni nazivi (Slavija, Brankov most, Bulevar...)
 * Poštujući pravilo iz ciscenje_ulica.py: pridevske ulice idu u -oj ("u Skerlićevoj ulici"),
 * dok prisvojni genitiv ostaje ("u Ulici kneza Višeslava").
 */
export function ulicaUGovornomPadezu(ulicaRaw?: string): string {
  const clean = srediUlicuEds(ulicaRaw || '');
  const k = kljuc(clean);
  if (!k) return 'na ovoj lokaciji';

  // Narodni nazivi (aliasi - odluka 3.2 i 4.1)
  if (k === 'trg slavija' || k === 'slavija') return 'na Slaviji';
  if (k === 'trg republike') return 'na Trgu republike';
  if (k === 'brankov most') return 'na Brankovom mostu';
  if (k === 'most gazela' || k === 'gazela') return 'na mostu Gazela';
  if (k === 'autokomanda') return 'na Autokomandi';

  if (k.startsWith('bulevar ')) {
    const rest = clean.slice(8).trim();
    return `u Bulevaru ${rest}`;
  }
  if (k.startsWith('trg ')) {
    const rest = clean.slice(4).trim();
    return `na Trgu ${rest}`;
  }

  const words = clean.split(/\s+/);
  // Jednočlani pridevski nazivi na -a (Skerlićeva -> u Skerlićevoj ulici, Vojvođanska -> u Vojvođanskoj ulici)
  if (words.length === 1 && clean.length >= 5 && /a$/i.test(clean)) {
    const stem = clean.slice(0, -1);
    return `u ${stem}oj ulici`;
  }

  return `u Ulici ${clean}`;
}

/**
 * Jednina ("broj 4") ili množina ("brojevi 2-24, 1-19") za prirodan izgovor kućnih brojeva
 */
export function formatHouseNumbersLabel(brojeviRaw?: string, withKucni = false): string {
  const cleaned = (brojeviRaw || '').trim();
  if (!cleaned) return '';
  const isPlural = /[,–-]/.test(cleaned) || /\d+\s+\d+/.test(cleaned);
  if (withKucni) {
    return `${isPlural ? 'kućni brojevi' : 'kućni broj'} ${cleaned}`;
  }
  return `${isPlural ? 'brojevi' : 'broj'} ${cleaned}`;
}

/**
 * Proverava da li se kućni broj korisnika poklapa sa EDS/BVK rasponom brojeva
 * Po pravilu iz izveštaja 2.4: "2-20, 1-23" = parna strana od 2 do 20 i neparna od 1 do 23!
 */
export function matchesHouseNumber(userNumber: number | null, edsBrojevi?: string): boolean {
  if (!userNumber || !edsBrojevi) return true;
  const parts = edsBrojevi.split(',').map((p) => p.trim());
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)[A-Za-z]?\s*-\s*(\d+)[A-Za-z]?$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (userNumber >= start && userNumber <= end) {
        // Ako su i start i end iste parnosti (npr. 2-20 ili 1-23), proveri parnost!
        if (start % 2 === end % 2) {
          if (userNumber % 2 === start % 2) return true;
        } else {
          return true;
        }
      }
    } else {
      const exactMatch = part.match(/^(\d+)/);
      if (exactMatch && Number(exactMatch[1]) === userNumber) {
        return true;
      }
    }
  }
  return false;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

// O(1) indeksirani rečnik beogradskih ulica (osnovni GAZETTEER_RECNIK + ~8.500+ OSM ulica iz ulice_beograd.json)
const gazetteerIndexByStreetKey = new Map<string, GazetteerEntry[]>();
let totalIndexedStreetsCount = GAZETTEER_RECNIK.length;
let osmStreetsLoaded = false;
let osmStreetsLoadingPromise: Promise<void> | null = null;

function indexGazetteerEntry(entry: GazetteerEntry): void {
  const keys = Array.from(
    new Set(
      [
        kljuc(entry.naziv),
        kljuc(srediUlicuEds(entry.naziv)),
        ...(entry.aliases || []).map((a) => kljuc(a)),
      ].filter(Boolean)
    )
  );
  for (const k of keys) {
    const list = gazetteerIndexByStreetKey.get(k);
    if (list) {
      list.push(entry);
    } else {
      gazetteerIndexByStreetKey.set(k, [entry]);
    }
  }
}

for (const g of GAZETTEER_RECNIK) {
  indexGazetteerEntry(g);
}

export async function loadOsmBelgradeStreets(): Promise<void> {
  if (osmStreetsLoaded) return;
  if (osmStreetsLoadingPromise) return osmStreetsLoadingPromise;

  osmStreetsLoadingPromise = (async () => {
    const urls = [
      './data/ulice_beograd.json',
      'https://stdevic-del.github.io/commute-companion-mobile/data/ulice_beograd.json',
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) continue;

        let added = 0;
        for (const r of rows) {
          if (Array.isArray(r) && r.length >= 5) {
            const [naziv, opstina, lat, lon, duzinaM] = r as [string, string, number, number, number];
            const entry: GazetteerEntry = {
              naziv,
              tip: 'ulica',
              opstina,
              naselje: '',
              lat: Number(lat),
              lon: Number(lon),
              bbox: [Number(lat) - 0.002, Number(lat) + 0.002, Number(lon) - 0.002, Number(lon) + 0.002],
              duzinaM: Number(duzinaM) || 250,
              duga: Number(duzinaM) >= 1500,
              osmNaziv: naziv,
            };
            indexGazetteerEntry(entry);
            added++;
          }
        }
        if (added > 0) {
          totalIndexedStreetsCount = GAZETTEER_RECNIK.length + added;
          osmStreetsLoaded = true;
          return;
        }
      } catch {
        // try next URL
      }
    }
  })();

  return osmStreetsLoadingPromise;
}

export function findGazetteerEntry(ulicaName: string, opstinaName?: string): GazetteerEntry | undefined {
  const cleaned = srediUlicuEds(ulicaName);
  const kName = kljuc(cleaned);
  if (!kName) return undefined;
  const kOp = kljuc(opstinaName);

  const candidates = gazetteerIndexByStreetKey.get(kName);
  if (!candidates || candidates.length === 0) return undefined;

  // First try exact street + municipality match (Beogradska Vračar != Beogradska Zemun)
  if (kOp && kOp !== 'beograd') {
    const withOp = candidates.find((g) => {
      const gOp = kljuc(g.opstina);
      return gOp.includes(kOp) || kOp.includes(gOp);
    });
    if (withOp) return withOp;
  }

  return candidates[0];
}

/**
 * Brza lokalna pretraga ulica, trgova, naselja i orijentira u Beogradu (13.885 lokacija)
 * radi bez čekanja i bez pozivanja spoljnog geokodera.
 */
export async function resolveBelgradeLocation(
  rawQuery: string
): Promise<{ found: boolean; lat?: number; lng?: number; displayName?: string }> {
  if (!rawQuery || !rawQuery.trim()) return { found: false };
  await loadOsmBelgradeStreets();

  const parts = rawQuery
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const firstPart = parts[0] || rawQuery.trim();
  const secondPart = parts[1] || '';

  // Izdvoji naziv ulice bez kućnog broja na kraju (npr. "Koriška 4" -> "Koriška", ali zadrži "Blok 45" ili "27. marta")
  const streetWithoutHouseNum = firstPart
    .replace(/^(?!blok\s+\d+)(.+?)\s+\d+[a-zA-Z]?(?:\/\d+)?$/i, '$1')
    .trim();

  const exactHit =
    findGazetteerEntry(streetWithoutHouseNum, secondPart) ||
    findGazetteerEntry(firstPart, secondPart);

  if (exactHit) {
    const cleanOp = (exactHit.opstina || '').replace('Градска општина ', '').split('|')[0].trim();
    return {
      found: true,
      lat: exactHit.lat,
      lng: exactHit.lon,
      displayName: cleanOp ? `${firstPart}, ${cleanOp}` : firstPart,
    };
  }

  // Delimično poklapanje — uzmi NAJBOLJI rangirani pogodak (ranije: prvi nasumični iz mape)
  const best = searchBelgradeStreets(firstPart, 1)[0];
  if (best) {
    return {
      found: true,
      lat: best.lat,
      lng: best.lng,
      displayName: best.label,
    };
  }

  return { found: false };
}

export interface StreetSuggestion {
  /** Puni tekst koji ide u polje: "Koriška 4, Zvezdara" */
  label: string;
  /** Naziv ulice/mesta bez broja */
  street: string;
  /** Kućni broj koji je korisnik ukucao (ako postoji) */
  houseNumber: string;
  /** Opština (latinica, bez prefiksa) */
  opstina: string;
  /** Tip: ulica, trg, naselje, orijentir... */
  tip: string;
  lat: number;
  lng: number;
}

const CENTRALNE_OPSTINE = new Set([
  'stari grad', 'vracar', 'savski venac', 'novi beograd', 'zemun', 'palilula',
  'zvezdara', 'vozdovac', 'cukarica', 'rakovica',
]);

function cistaOpstina(op?: string): string {
  return uLatinicu((op || '').replace('Градска општина ', '').split('|')[0].trim());
}

const CIR_LAT: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I', Ј: 'J',
  К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T',
  Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j',
  к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

/** Ćirilica → latinica (sa dijakriticima), za prikaz korisniku. */
export function uLatinicu(s: string): string {
  return Array.from(s || '').map((ch) => CIR_LAT[ch] ?? ch).join('');
}

/**
 * Pretraga ulica dok korisnik kuca (padajući meni). Potpuno lokalno, iz 13.759 OSM ulica
 * + rečnika trgova/naselja/orijentira. Rang: početak naziva > početak reči > sadrži;
 * zatim centralne opštine i duže ulice. Kućni broj iz upita se čuva u predlogu.
 */
export function searchBelgradeStreets(rawQuery: string, limit = 8): StreetSuggestion[] {
  const firstPart = (rawQuery || '').split(',')[0].trim();
  const wantedOp = kljuc((rawQuery || '').split(',')[1] || '');
  if (firstPart.length < 2) return [];

  const numMatch = firstPart.match(/^(?!blok\s+\d+$)(.+?)\s+(\d+[a-zA-Z]?(?:\/\d+)?)$/i);
  const streetPart = numMatch ? numMatch[1] : firstPart;
  const houseNumber = numMatch ? numMatch[2] : '';
  const q = kljuc(srediUlicuEds(streetPart)) || kljuc(streetPart);
  if (q.length < 2) return [];

  const qTokens = q.split(' ').filter(Boolean);
  const tokenPrefixMatch = (k: string): number => {
    // -1 = nema; 0 = prva reč se poklapa sa prvim tokenom; 1 = tokeni negde redom
    const words = k.split(' ');
    let wi = 0;
    let firstAligned = false;
    for (let ti = 0; ti < qTokens.length; ti++) {
      let found = false;
      while (wi < words.length) {
        if (words[wi].startsWith(qTokens[ti])) {
          if (ti === 0 && wi === 0) firstAligned = true;
          wi++;
          found = true;
          break;
        }
        wi++;
      }
      if (!found) return -1;
    }
    return firstAligned ? 0 : 1;
  };

  const bestScore = new Map<GazetteerEntry, number>();

  for (const [k, entries] of gazetteerIndexByStreetKey.entries()) {
    let rank = -1;
    if (k === q) rank = 0;
    else if (k.startsWith(q)) rank = 1;
    else {
      const tp = qTokens.length > 0 ? tokenPrefixMatch(k) : -1;
      if (tp === 0) rank = 1.5;
      else if (tp === 1) rank = 2;
      else if (q.length >= 3 && k.includes(q)) rank = 3;
    }
    if (rank < 0) continue;
    for (const e of entries) {
      const nazivK = kljuc(e.naziv);
      const isAliasKey = k !== nazivK && k !== kljuc(srediUlicuEds(e.naziv)) && !nazivK.includes(q);
      const opK = kljuc(cistaOpstina(e.opstina));
      const central = CENTRALNE_OPSTINE.has(opK) ? 0 : 1;
      const isCurated = e.tip && e.tip !== 'ulica' ? -0.5 : 0;
      const lengthBonus = Math.min(1, (e.duzinaM || 0) / 3000);
      const opBoost = wantedOp && opK && (opK.includes(wantedOp) || wantedOp.includes(opK)) ? -6 : 0;
      const score =
        (rank + (isAliasKey ? 1.5 : 0)) * 10 + central * 6 + isCurated - lengthBonus + opBoost;
      const prev = bestScore.get(e);
      if (prev === undefined || score < prev) bestScore.set(e, score);
    }
  }

  const scored = Array.from(bestScore.entries()).map(([e, score]) => ({ e, score }));
  scored.sort((a, b) => a.score - b.score);

  const out: StreetSuggestion[] = [];
  const dedupe = new Set<string>();
  for (const { e } of scored) {
    const street = uLatinicu(e.osmNaziv || e.naziv);
    const opstina = cistaOpstina(e.opstina);
    const key = `${kljuc(street)}|${kljuc(opstina)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    const head = houseNumber ? `${street} ${houseNumber}` : street;
    out.push({
      label: opstina ? `${head}, ${opstina}` : head,
      street,
      houseNumber,
      opstina,
      tip: e.tip || 'ulica',
      lat: e.lat,
      lng: e.lon,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Da li je baza od 13.759 ulica učitana (za prikaz u padajućem meniju). */
export function isOsmStreetsLoaded(): boolean {
  return osmStreetsLoaded;
}

/**
 * Određuje najbližu opštinu za date koordinate iz našeg rečnika
 */
export function inferMunicipalityFromCoords(coords: { lat: number; lng: number }): string {
  let bestOp = 'Beograd';
  let minD = Infinity;
  for (const g of GAZETTEER_RECNIK) {
    if (!g.opstina) continue;
    const d = haversineMeters(coords, { lat: g.lat, lng: g.lon });
    if (d < minD) {
      minD = d;
      bestOp = g.opstina.split('|')[0].replace('Градска општина ', '').trim();
    }
  }
  return bestOp;
}

export interface LiveServiceFeedPayload {
  verzija: number;
  generisano: string;
  izvori: Record<string, { ok: boolean; broj: number; greska?: string }>;
  eds: EdsOutageRow[];
  direktni: DirectServiceRecord[];
  nepoznate_ulice?: string[];
}

const LIVE_FEED_CACHE_KEY = 'commute_companion_live_servisi_v2';

let liveServiceFeed: LiveServiceFeedPayload | null = (() => {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LIVE_FEED_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.eds) && Array.isArray(parsed.direktni)) {
          return parsed as LiveServiceFeedPayload;
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
})();

export function getLiveServiceFeedMeta(): {
  loaded: boolean;
  generisano?: string;
  izvori?: Record<string, { ok: boolean; broj: number; greska?: string }>;
  edsCount: number;
  directCount: number;
  osmStreetsCount: number;
} {
  return {
    loaded: Boolean(liveServiceFeed),
    generisano: liveServiceFeed?.generisano,
    izvori: liveServiceFeed?.izvori,
    edsCount: liveServiceFeed?.eds?.length ?? EDS_PLANNED_OUTAGES.length,
    directCount: liveServiceFeed?.direktni?.length ?? 0,
    osmStreetsCount: totalIndexedStreetsCount,
  };
}

export async function refreshLiveServiceFeed(options?: {
  triggerBackendScrape?: boolean;
  centralApiUrl?: string | null;
}): Promise<LiveServiceFeedPayload | null> {
  // Učitaj paralelno OSM bazu svih beogradskih ulica (ako već nije učitana)
  loadOsmBelgradeStreets().catch(() => {});

  const envCentralUrl = (() => {
    if (options?.centralApiUrl !== undefined) return options.centralApiUrl;
    try {
      const globalOverride = (globalThis as unknown as { __VITE_DATA_API_URL__?: string })
        .__VITE_DATA_API_URL__;
      if (typeof globalOverride === 'string' && globalOverride.trim()) {
        return globalOverride.trim().replace(/\/+$/, '');
      }
      const v =
        typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env
          ?.VITE_DATA_API_URL;
      return v && v.trim() ? v.trim().replace(/\/+$/, '') : null;
    } catch {
      return null;
    }
  })();

  const centralUrls: string[] = [];
  if (envCentralUrl) {
    if (envCentralUrl.endsWith('.json')) {
      centralUrls.push(`${envCentralUrl}?t=${Date.now()}`);
    } else {
      centralUrls.push(`${envCentralUrl}/servisi.json?t=${Date.now()}`);
      centralUrls.push(`${envCentralUrl}?t=${Date.now()}`);
    }
  }

  const urls = [
    ...(options?.triggerBackendScrape ? ['/api/servisi/refresh'] : []),
    ...centralUrls,
    `./data/servisi.json?t=${Date.now()}`,
    `https://stdevic-del.github.io/commute-companion-mobile/data/servisi.json?t=${Date.now()}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: url.startsWith('/api/') ? 'POST' : 'GET',
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const rawData = await res.json();
      const data =
        rawData &&
        rawData.services &&
        Array.isArray(rawData.services.eds) &&
        Array.isArray(rawData.services.direktni)
          ? rawData.services
          : rawData;
      if (data && Array.isArray(data.eds) && Array.isArray(data.direktni)) {
        liveServiceFeed = data as LiveServiceFeedPayload;
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LIVE_FEED_CACHE_KEY, JSON.stringify(liveServiceFeed));
          }
        } catch {
          // ignore
        }
        await loadOsmBelgradeStreets();
        return liveServiceFeed;
      }
    } catch {
      // try next URL
    }
  }
  await loadOsmBelgradeStreets();
  return liveServiceFeed;
}

function getBelgradeNowMinutes(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Belgrade',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? new Date().getHours());
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? new Date().getMinutes());
    return h * 60 + m;
  } catch {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

/**
 * Gradi kompletan Servisni Radar u 3 tačke (Polazište -> Na trasi -> Cilj)
 * i prioritizuje stavke prema trenutnoj lokaciji korisnika (Pravilo Šoferšajbne: Ispred vs Iza)
 */
export function buildThreePointServiceRadar(options: {
  prefs: UserPreferences;
  routeCoords?: Array<[number, number]>;
  routeStreetNames?: string[];
  userCurrentCoords?: { lat: number; lng: number };
}): {
  alerts: ServiceAlertItem[];
  parkingGarages: ServiceAlertItem[];
  trafficNodes: TrafficNode[];
  spokenChapterIntro: string;
  spokenChapterExpanded: string;
} {
  const { prefs, routeCoords = [], routeStreetNames = [], userCurrentCoords } = options;
  const startCoords = prefs.startCoords || prefs.coords || { lat: 44.8206, lng: 20.4144 };
  const endCoords = prefs.endCoords || { lat: 44.8162, lng: 20.4603 };
  const currentPos = userCurrentCoords || prefs.coords || startCoords;
  const transportMode = prefs.transportMode || 'car';
  const userLines = (prefs.favoriteTransitLines || []).map((l) => l.trim().toUpperCase());
  const savedStreets = prefs.savedStreets || [];

  // Calculate where the user currently is along the route (0.0 = start, 1.0 = destination)
  const totalRouteDist = Math.max(200, haversineMeters(startCoords, endCoords));
  const distFromStart = haversineMeters(startCoords, currentPos);
  const userProgressRatio = Math.min(1, Math.max(0, Number((distFromStart / totalRouteDist).toFixed(2))));

  const rawAddressInputs = [
    prefs.startPoint || '',
    prefs.homeAddress || '',
    prefs.destination || '',
    prefs.workAddress || '',
    ...savedStreets,
  ].filter(Boolean);

  // Map normalized street key -> user's specific house number (if provided, e.g. "Kneza Višeslava 88" -> 88)
  const userHouseNumberByStreet = new Map<string, number>();
  for (const addr of rawAddressInputs) {
    const firstSegment = addr.split(',')[0] || addr;
    const numMatch = firstSegment.match(/\b(\d+)\s*[a-zA-Z]?\b/);
    const streetOnly = kljuc(srediUlicuEds(firstSegment.replace(/\d+.*$/, '')));
    if (streetOnly && numMatch) {
      userHouseNumberByStreet.set(streetOnly, Number(numMatch[1]));
    }
  }

  // Home streets (strictly for power/water notifications directly tied to the user's home)
  const rawHomeInputs = [prefs.homeAddress || '', ...savedStreets].filter(Boolean);
  const normalizedHomeStreets = new Set(
    rawHomeInputs
      .map((s) => kljuc(srediUlicuEds((s.split(',')[0] || s).replace(/\d+.*$/, ''))))
      .filter(
        (k) =>
          k &&
          k.length >= 4 &&
          k !== 'moja lokacija' &&
          k !== 'beograd' &&
          k !== 'novi beograd'
      )
  );

  // Exact endpoint streets (Home, Start, Destination, Work, Saved Streets)
  const normalizedEndpointStreets = new Set(
    rawAddressInputs
      .map((s) => kljuc(srediUlicuEds((s.split(',')[0] || s).replace(/\d+.*$/, ''))))
      .filter(
        (k) =>
          k &&
          k.length >= 4 &&
          k !== 'moja lokacija' &&
          k !== 'beograd' &&
          k !== 'novi beograd'
      )
  );

  // Actual streets traversed by the OSRM route
  const normalizedCorridorStreets = new Set(
    routeStreetNames
      .map((s) => kljuc(srediUlicuEds(s.replace(/\d+.*$/, ''))))
      .filter((k) => k && k.length >= 4)
  );

  const belgradeNowMins = getBelgradeNowMinutes();

  const isExpiredTimeWindow = (tw?: string, isForecast?: boolean): boolean => {
    if (!tw) return false;
    const dm = tw.match(/(\d{1,2})\.(\d{1,2})\.\s*[-–]\s*(\d{1,2})\.(\d{1,2})\./);
    if (dm) {
      const endDay = Number(dm[3]);
      const endMonth = Number(dm[4]);
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curDay = now.getDate();
      if (endMonth < curMonth || (endMonth === curMonth && endDay < curDay)) {
        return true;
      }
    }

    if (!isForecast) {
      const rangeHm = tw.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
      if (rangeHm) {
        const startH = Number(rangeHm[1]);
        const endH = Number(rangeHm[3]);
        const endM = Number(rangeHm[4]);
        if (endH >= startH && endH > 0 && endH < 24) {
          const endTotalMins = endH * 60 + endM;
          if (belgradeNowMins > endTotalMins + 15) {
            return true;
          }
        }
      }
      const untilHm = tw.match(/\bdo\s+(\d{1,2}):(\d{2})\b/i);
      if (untilHm) {
        const endH = Number(untilHm[1]);
        const endM = Number(untilHm[2]);
        if (endH > 0 && endH < 24) {
          const endTotalMins = endH * 60 + endM;
          if (belgradeNowMins > endTotalMins + 15) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const findUserHouseNumberForStreet = (streetKey: string): number | null => {
    for (const [k, num] of userHouseNumberByStreet.entries()) {
      if (k.includes(streetKey) || streetKey.includes(k)) {
        return num;
      }
    }
    return null;
  };

  const candidateAlerts: ServiceAlertItem[] = [];
  const candidateGarages: ServiceAlertItem[] = [];

  const activeDirectRecords: DirectServiceRecord[] =
    liveServiceFeed && Array.isArray(liveServiceFeed.direktni)
      ? liveServiceFeed.direktni
      : ACTIVE_DIRECT_SERVICE_RECORDS;

  const activeEdsRows: EdsOutageRow[] =
    liveServiceFeed && liveServiceFeed.eds.length > 0
      ? liveServiceFeed.eds
      : EDS_PLANNED_OUTAGES;

  // 1) Proveri direktne aktivne servise (GSP, BVK, Saobraćaj, Radovi, Garaže)
  for (const rec of activeDirectRecords) {
    if (isExpiredTimeWindow(rec.timeWindow, rec.isForecast)) continue;
    if (rec.category === 'garaza' && transportMode === 'transit') continue;

    const gaz = findGazetteerEntry(rec.ulica, rec.opstina);
    const itemCoords =
      typeof rec.lat === 'number' && typeof rec.lng === 'number'
        ? { lat: rec.lat, lng: rec.lng }
        : gaz
        ? { lat: gaz.lat, lng: gaz.lon }
        : undefined;

    const dStart = itemCoords ? haversineMeters(startCoords, itemCoords) : 9999;
    const dEnd = itemCoords ? haversineMeters(endCoords, itemCoords) : 9999;
    const dUser = itemCoords ? haversineMeters(currentPos, itemCoords) : 9999;

    // A) Garaže na cilju čuvamo u posebnom nizu (samo kad se ide kolima)
    if (rec.category === 'garaza') {
      if (dEnd > 850) continue;
      const opLoc = opstinaULokativu(rec.opstina);
      const cleanParkingSummary = rec.rawSummary
        .replace(/\(([^()]+)\s+\([^()]+\)\)/g, '($1)')
        .replace(/(Parkiralište\s+[^—]+?\bje\s+(?:skoro|trenutno)\s+)popunjena\b/gi, '$1popunjeno');

      candidateGarages.push({
        id: rec.id,
        zone: 'destination',
        category: 'garaza',
        urgencyLevel: rec.urgencyLevel,
        title: `Parking — ${rec.ulica}`,
        spokenText: `Na prilazu cilju (${opLoc}): ${cleanParkingSummary}`,
        opstina: rec.opstina.split('|')[0].trim(),
        ulica: rec.ulica,
        timeWindow: rec.timeWindow,
        distanceMeters: dEnd,
        progressRatio: 0.92,
        isAhead: true,
        lat: itemCoords?.lat,
        lng: itemCoords?.lng,
        sourceName: rec.sourceName,
        url: rec.url,
      });
      continue;
    }

    // Da li preseca OSRM trasu?
    let minRouteDist = 9999;
    let bestRouteIdx = 0;
    if (itemCoords && routeCoords.length > 0) {
      routeCoords.forEach((pt, idx) => {
        const d = haversineMeters({ lat: pt[0], lng: pt[1] }, itemCoords);
        if (d < minRouteDist) {
          minRouteDist = d;
          bestRouteIdx = idx;
        }
      });
    }

    const streetKey = kljuc(rec.ulica);
    const userHouseNum = findUserHouseNumberForStreet(streetKey);
    const houseMatches = matchesHouseNumber(userHouseNum, rec.brojevi);

    if (userHouseNum !== null && rec.brojevi && !houseMatches) {
      continue;
    }

    const matchedHomeStreet =
      streetKey !== 'vise lokacija' &&
      streetKey.length >= 4 &&
      Array.from(normalizedHomeStreets).some(
        (hs) => hs && (hs === streetKey || hs.includes(streetKey) || streetKey.includes(hs))
      );

    const matchedEndpointStreet =
      streetKey !== 'vise lokacija' &&
      streetKey.length >= 4 &&
      Array.from(normalizedEndpointStreets).some(
        (es) => es && (es === streetKey || es.includes(streetKey) || streetKey.includes(es))
      );

    const matchedCorridorStreet =
      streetKey !== 'vise lokacija' &&
      streetKey.length >= 4 &&
      Array.from(normalizedCorridorStreets).some(
        (cs) => cs && (cs === streetKey || cs.includes(streetKey) || streetKey.includes(cs))
      );

    const lineMatched =
      rec.category === 'prevoz' &&
      transportMode === 'transit' &&
      Boolean(rec.transitLines) &&
      userLines.length > 0 &&
      rec.transitLines!.some((l) => userLines.includes(l.toUpperCase())) &&
      (minRouteDist <= 600 || dStart <= 600 || dEnd <= 600 || matchedCorridorStreet);

    // STRIKTNI FILTER:
    // 1) Voda (BVK) prikazuje se ISKLJUČIVO ako je u direktnoj vezi sa kućom (matchedHomeStreet)
    let zone: ServicePointZone | null = null;
    let progressRatio = 0.5;

    if (rec.category === 'voda') {
      if (matchedHomeStreet) {
        zone = 'start';
        progressRatio = 0.1;
      } else {
        continue;
      }
    } else if (rec.category === 'prevoz') {
      // 2) GSP prevoz prikazujemo samo kad korisnik ide gradskim prevozom i izmena kači njegovu liniju ili samu ulicu kojom prolazi trasa
      if (transportMode !== 'transit') continue;
      const onTransitCorridor =
        normalizedCorridorStreets.size > 0
          ? matchedCorridorStreet && minRouteDist <= 220
          : minRouteDist <= 80;
      if (lineMatched || onTransitCorridor) {
        zone = 'route';
        progressRatio =
          routeCoords.length > 1 && minRouteDist <= 800
            ? Number((bestRouteIdx / (routeCoords.length - 1)).toFixed(2))
            : 0.5;
      } else {
        continue;
      }
    } else {
      // 3) Radovi na putu i saobraćaj: SAMO ako su direktno na putanji (u ulici kojom trasa zaista prolazi ili na samoj polaznoj/ciljnoj ulici)
      const onDrivingCorridor =
        normalizedCorridorStreets.size > 0
          ? matchedCorridorStreet && minRouteDist <= 250
          : minRouteDist <= 75;
      if (matchedEndpointStreet && (dStart <= 400 || dEnd <= 400)) {
        zone = dEnd < dStart ? 'destination' : 'start';
        progressRatio = zone === 'destination' ? 0.88 : 0.12;
      } else if (matchedEndpointStreet) {
        zone = dEnd < dStart ? 'destination' : 'start';
        progressRatio = zone === 'destination' ? 0.88 : 0.12;
      } else if (onDrivingCorridor) {
        zone = 'route';
        progressRatio =
          routeCoords.length > 1
            ? Number((bestRouteIdx / (routeCoords.length - 1)).toFixed(2))
            : 0.5;
      } else {
        continue;
      }
    }

    if (!zone) continue;

    const isAhead = progressRatio >= userProgressRatio - 0.08;
    let urgencyLevel: 1 | 2 | 3 = rec.urgencyLevel;
    if (transportMode === 'transit' && rec.category === 'prevoz') {
      urgencyLevel = 1;
    }
    if (transportMode === 'car' && rec.category === 'radovi' && zone === 'route') {
      urgencyLevel = 1;
    }
    if (userHouseNum !== null && rec.brojevi && houseMatches) {
      urgencyLevel = 1;
    }

    const opLoc = opstinaULokativu(rec.opstina);
    const ulLoc = ulicaUGovornomPadezu(rec.ulica);
    const exactNumNote =
      userHouseNum !== null && rec.brojevi && houseMatches
        ? ` (uključujući vaš broj ${userHouseNum})`
        : '';
    const houseLabel = formatHouseNumbersLabel(rec.brojevi, false);

    const spokenText =
      rec.category === 'prevoz'
        ? `${opLoc}, ${ulLoc}: izmena režima linija ${(rec.transitLines || []).join(', ')} (${rec.timeWindow}).`
        : rec.category === 'radovi'
        ? `Radovi na putanji (${opLoc}, ${ulLoc}, ${rec.timeWindow || 'u toku'}) — računajte na usporenu vožnju.`
        : rec.category === 'voda'
        ? `${rec.isForecast ? 'Planirani radovi na vodovodu' : 'Kvar na vodovodnoj mreži'} ${opLoc}, ${ulLoc}${houseLabel ? ` (${houseLabel}${exactNumNote})` : ''} — bez vode ${rec.timeWindow}.`
        : rec.rawSummary;

    candidateAlerts.push({
      id: rec.id,
      zone,
      category: rec.category,
      urgencyLevel,
      title:
        rec.category === 'prevoz'
          ? `Izmena GSP linija ${(rec.transitLines || []).join(', ')} — ${rec.ulica}`
          : rec.category === 'radovi'
          ? `Radovi na trasi: ${rec.ulica}`
          : rec.category === 'voda'
          ? `Voda (BVK): ${rec.ulica}${exactNumNote}`
          : `Saobraćaj: ${rec.ulica}`,
      spokenText,
      opstina: rec.opstina.split('|')[0].trim(),
      ulica: rec.ulica,
      brojevi: rec.brojevi,
      timeWindow: rec.timeWindow,
      isForecast: rec.isForecast,
      transitLines: rec.transitLines,
      distanceMeters: dUser < 9000 ? dUser : undefined,
      progressRatio,
      isAhead,
      lat: itemCoords?.lat,
      lng: itemCoords?.lng,
      dugaUlica: gaz?.duga,
      duzinaM: gaz?.duzinaM,
      sourceName: rec.sourceName,
      url: rec.url,
    });
  }

  // 2) Proveri EDS planirana isključenja struje — ISKLJUČIVO ako su u direktnoj vezi sa kućom (normalizedHomeStreets + kućni broj)
  for (let i = 0; i < activeEdsRows.length; i++) {
    const row = activeEdsRows[i];
    const isForecast = row.izvor !== 'Dan_0';
    if (!isForecast && isExpiredTimeWindow(`${row.od}–${row.do}`, false)) {
      continue;
    }

    const cleanUlica = srediUlicuEds(row.ulica);
    const kUlica = kljuc(cleanUlica);
    if (!kUlica || kUlica.length < 4) continue;

    const gaz = findGazetteerEntry(cleanUlica, row.opstina);
    const itemCoords = gaz ? { lat: gaz.lat, lng: gaz.lon } : undefined;
    const dUser = itemCoords ? haversineMeters(currentPos, itemCoords) : 9999;

    const userHouseNum = findUserHouseNumberForStreet(kUlica);
    const houseMatches = matchesHouseNumber(userHouseNum, row.brojevi);

    if (userHouseNum !== null && row.brojevi && !houseMatches) {
      continue;
    }

    const matchedHomeStreet = Array.from(normalizedHomeStreets).some(
      (hs) => hs && (hs === kUlica || hs.includes(kUlica) || kUlica.includes(hs))
    );

    if (!matchedHomeStreet) {
      continue;
    }

    const zone: ServicePointZone = 'start';
    const progressRatio = 0.1;

    const opLoc = opstinaULokativu(row.opstina);
    const ulLoc = ulicaUGovornomPadezu(cleanUlica);
    const dayLabel = isForecast ? 'Najava' : 'Danas';
    const exactHouseHit = userHouseNum !== null && Boolean(row.brojevi) && houseMatches;
    const edsHouseLabel = formatHouseNumbersLabel(row.brojevi, true);

    candidateAlerts.push({
      id: `eds-${i}-${kUlica.replace(/\s+/g, '-')}`,
      zone,
      category: 'struja',
      urgencyLevel: exactHouseHit ? 1 : 2,
      title: `Struja (${dayLabel}): ${cleanUlica} ${row.brojevi ? `br. ${row.brojevi}` : ''}${
        exactHouseHit ? ` [Vaš br. ${userHouseNum}]` : ''
      }`,
      spokenText: `${isForecast ? 'Najava Elektrodistribucije' : 'Planirano isključenje struje'} ${opLoc}, ${ulLoc}${
        edsHouseLabel
          ? ` (${edsHouseLabel}${exactHouseHit ? `, što obuhvata vaš broj ${userHouseNum}` : ''})`
          : ''
      } u terminu od ${row.od} do ${row.do} časova.`,
      opstina: row.opstina,
      ulica: cleanUlica,
      brojevi: row.brojevi,
      timeWindow: `${row.od}–${row.do}`,
      datum: row.datum,
      isForecast,
      distanceMeters: dUser < 9000 ? dUser : undefined,
      progressRatio,
      isAhead: progressRatio >= userProgressRatio - 0.08,
      lat: itemCoords?.lat,
      lng: itemCoords?.lng,
      dugaUlica: gaz?.duga,
      duzinaM: gaz?.duzinaM,
      sourceName: `Elektrodistribucija Srbije (${row.izvor})`,
      url: 'https://elektrodistribucija.rs/planirana-iskljucenja-beograd/Dan_0_Iskljucenja.htm',
    });
  }

  candidateAlerts.sort((a, b) => {
    if (Boolean(a.isAhead) !== Boolean(b.isAhead)) {
      return a.isAhead ? -1 : 1;
    }
    if (a.urgencyLevel !== b.urgencyLevel) {
      return a.urgencyLevel - b.urgencyLevel;
    }
    return (a.distanceMeters ?? 5000) - (b.distanceMeters ?? 5000);
  });

  const seenKeys = new Set<string>();
  const deduped: ServiceAlertItem[] = [];
  for (const item of candidateAlerts) {
    const kUl = kljuc(item.ulica);
    const key =
      kUl === 'vise lokacija'
        ? `${item.category}:${item.id}`
        : `${item.category}:${kUl}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(item);
  }

  candidateGarages.sort((a, b) => (a.distanceMeters ?? 5000) - (b.distanceMeters ?? 5000));
  const topGarages = candidateGarages.slice(0, 3);
  const topAlerts = deduped.slice(0, 5);

  const trafficNodes: TrafficNode[] = topAlerts
    .filter((a) => a.lat && a.lng)
    .slice(0, 5)
    .map((a, idx) => {
      const delayMinutes =
        a.category === 'radovi'
          ? 5
          : a.category === 'saobracaj'
          ? 4
          : a.category === 'prevoz' && transportMode === 'transit'
          ? 4
          : 0;
      const severity: TrafficNode['severity'] =
        a.category === 'saobracaj'
          ? 'zastoj'
          : a.category === 'radovi'
          ? 'radovi'
          : 'prohodno';
      return {
        id: `srv-node-${idx}-${a.id}`,
        title: a.title,
        locationName: `${a.ulica} (${a.opstina})`,
        severity,
        delayMinutes,
        description: a.spokenText,
        progressRatio: a.progressRatio ?? 0.5,
        lat: a.lat,
        lng: a.lng,
        category: a.category,
        urgencyLevel: a.urgencyLevel,
      };
    });

  const aheadAlerts = topAlerts.filter((a) => a.isAhead !== false);
  const startZoneAlerts = aheadAlerts.filter((a) => a.zone === 'start');
  const routeZoneAlerts = aheadAlerts.filter((a) => a.zone === 'route');
  const destZoneAlerts = aheadAlerts.filter((a) => a.zone === 'destination');

  const top1 = aheadAlerts[0];
  const top2 = aheadAlerts[1];

  const spokenChapterIntro = top1
    ? `Važna napomena za vaš put: ${top1.spokenText}${
        top2 ? ` Pored toga, ${top2.spokenText.charAt(0).toLowerCase() + top2.spokenText.slice(1)}` : ''
      }`
    : `Na vašoj adresi i duž putanje sve je mirno i prohodno — nema radova ni isključenja koji utiču na vaš put.`;

  const expandedParts: string[] = [];
  if (startZoneAlerts.length > 0) {
    expandedParts.push(
      `Kod polazišta: ${startZoneAlerts.map((a) => a.spokenText).join(' ')}`
    );
  }
  if (routeZoneAlerts.length > 0) {
    expandedParts.push(
      `Direktno na trasi: ${routeZoneAlerts.map((a) => a.spokenText).join(' ')}`
    );
  }
  if (destZoneAlerts.length > 0) {
    expandedParts.push(
      `Na cilju: ${destZoneAlerts.map((a) => a.spokenText).join(' ')}`
    );
  }
  if (topGarages.length > 0 && transportMode === 'car') {
    expandedParts.push(
      `Slobodna mesta u garažama na cilju: ${topGarages.map((g) => `${g.ulica} (${g.timeWindow})`).join(', ')}.`
    );
  }

  const spokenChapterExpanded =
    expandedParts.join('\n') ||
    'Na polazištu, trasi i cilju nema nikakvih radova niti planiranih isključenja struje i vode.';

  return {
    alerts: topAlerts,
    parkingGarages: topGarages,
    trafficNodes,
    spokenChapterIntro,
    spokenChapterExpanded,
  };
}
