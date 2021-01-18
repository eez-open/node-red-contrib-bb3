"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeDlog = exports.Scale = exports.Unit = void 0;
var Unit;
(function (Unit) {
    Unit[Unit["UNIT_NONE"] = -1] = "UNIT_NONE";
    Unit[Unit["UNIT_UNKNOWN"] = 0] = "UNIT_UNKNOWN";
    Unit[Unit["UNIT_VOLT"] = 1] = "UNIT_VOLT";
    Unit[Unit["UNIT_MILLI_VOLT"] = 2] = "UNIT_MILLI_VOLT";
    Unit[Unit["UNIT_AMPER"] = 3] = "UNIT_AMPER";
    Unit[Unit["UNIT_MILLI_AMPER"] = 4] = "UNIT_MILLI_AMPER";
    Unit[Unit["UNIT_MICRO_AMPER"] = 5] = "UNIT_MICRO_AMPER";
    Unit[Unit["UNIT_WATT"] = 6] = "UNIT_WATT";
    Unit[Unit["UNIT_MILLI_WATT"] = 7] = "UNIT_MILLI_WATT";
    Unit[Unit["UNIT_SECOND"] = 8] = "UNIT_SECOND";
    Unit[Unit["UNIT_MILLI_SECOND"] = 9] = "UNIT_MILLI_SECOND";
    Unit[Unit["UNIT_CELSIUS"] = 10] = "UNIT_CELSIUS";
    Unit[Unit["UNIT_RPM"] = 11] = "UNIT_RPM";
    Unit[Unit["UNIT_OHM"] = 12] = "UNIT_OHM";
    Unit[Unit["UNIT_KOHM"] = 13] = "UNIT_KOHM";
    Unit[Unit["UNIT_MOHM"] = 14] = "UNIT_MOHM";
    Unit[Unit["UNIT_PERCENT"] = 15] = "UNIT_PERCENT";
    Unit[Unit["UNIT_HERTZ"] = 16] = "UNIT_HERTZ";
    Unit[Unit["UNIT_MILLI_HERTZ"] = 17] = "UNIT_MILLI_HERTZ";
    Unit[Unit["UNIT_KHERTZ"] = 18] = "UNIT_KHERTZ";
    Unit[Unit["UNIT_MHERTZ"] = 19] = "UNIT_MHERTZ";
    Unit[Unit["UNIT_JOULE"] = 20] = "UNIT_JOULE";
    Unit[Unit["UNIT_FARAD"] = 21] = "UNIT_FARAD";
    Unit[Unit["UNIT_MILLI_FARAD"] = 22] = "UNIT_MILLI_FARAD";
    Unit[Unit["UNIT_MICRO_FARAD"] = 23] = "UNIT_MICRO_FARAD";
    Unit[Unit["UNIT_NANO_FARAD"] = 24] = "UNIT_NANO_FARAD";
    Unit[Unit["UNIT_PICO_FARAD"] = 25] = "UNIT_PICO_FARAD";
    Unit[Unit["UNIT_MINUTE"] = 26] = "UNIT_MINUTE";
    Unit[Unit["UNIT_BIT"] = 27] = "UNIT_BIT";
})(Unit = exports.Unit || (exports.Unit = {}));
var Fields;
(function (Fields) {
    Fields[Fields["FIELD_ID_COMMENT"] = 1] = "FIELD_ID_COMMENT";
    Fields[Fields["FIELD_ID_X_UNIT"] = 10] = "FIELD_ID_X_UNIT";
    Fields[Fields["FIELD_ID_X_STEP"] = 11] = "FIELD_ID_X_STEP";
    Fields[Fields["FIELD_ID_X_RANGE_MIN"] = 12] = "FIELD_ID_X_RANGE_MIN";
    Fields[Fields["FIELD_ID_X_RANGE_MAX"] = 13] = "FIELD_ID_X_RANGE_MAX";
    Fields[Fields["FIELD_ID_X_LABEL"] = 14] = "FIELD_ID_X_LABEL";
    Fields[Fields["FIELD_ID_X_SCALE"] = 15] = "FIELD_ID_X_SCALE";
    Fields[Fields["FIELD_ID_Y_UNIT"] = 30] = "FIELD_ID_Y_UNIT";
    Fields[Fields["FIELD_ID_Y_RANGE_MIN"] = 32] = "FIELD_ID_Y_RANGE_MIN";
    Fields[Fields["FIELD_ID_Y_RANGE_MAX"] = 33] = "FIELD_ID_Y_RANGE_MAX";
    Fields[Fields["FIELD_ID_Y_LABEL"] = 34] = "FIELD_ID_Y_LABEL";
    Fields[Fields["FIELD_ID_Y_CHANNEL_INDEX"] = 35] = "FIELD_ID_Y_CHANNEL_INDEX";
    Fields[Fields["FIELD_ID_Y_SCALE"] = 36] = "FIELD_ID_Y_SCALE";
    Fields[Fields["FIELD_ID_CHANNEL_MODULE_TYPE"] = 50] = "FIELD_ID_CHANNEL_MODULE_TYPE";
    Fields[Fields["FIELD_ID_CHANNEL_MODULE_REVISION"] = 51] = "FIELD_ID_CHANNEL_MODULE_REVISION";
})(Fields || (Fields = {}));
var Scale;
(function (Scale) {
    Scale[Scale["LINEAR"] = 0] = "LINEAR";
    Scale[Scale["LOGARITHMIC"] = 1] = "LOGARITHMIC";
})(Scale = exports.Scale || (exports.Scale = {}));
const DLOG_MAGIC1 = 0x2d5a4545;
const DLOG_MAGIC2 = 0x474f4c44;
const DLOG_VERSION1 = 0x0001;
const DLOG_VERSION2 = 0x0002;
function decodeDlog(data, getUnit) {
    const buffer = Buffer.allocUnsafe(4);
    function readFloat(i) {
        buffer[0] = data[i];
        buffer[1] = data[i + 1];
        buffer[2] = data[i + 2];
        buffer[3] = data[i + 3];
        return buffer.readFloatLE(0);
    }
    function readUInt8(i) {
        buffer[0] = data[i];
        return buffer.readUInt8(0);
    }
    function readString(start, end) {
        return new Buffer(data.slice(start, end)).toString();
    }
    function readUInt16(i) {
        buffer[0] = data[i];
        buffer[1] = data[i + 1];
        return buffer.readUInt16LE(0);
    }
    function readUInt32(i) {
        buffer[0] = data[i];
        buffer[1] = data[i + 1];
        buffer[2] = data[i + 2];
        buffer[3] = data[i + 3];
        return buffer.readUInt32LE(0);
    }
    function readColumns() {
        const columns = readUInt32(12);
        for (let iChannel = 0; iChannel < 8; iChannel++) {
            if (columns & (1 << (4 * iChannel))) {
                yAxes.push({
                    unit: getUnit(Unit.UNIT_VOLT),
                    channelIndex: iChannel,
                });
            }
            if (columns & (2 << (4 * iChannel))) {
                yAxes.push({
                    unit: getUnit(Unit.UNIT_AMPER),
                    channelIndex: iChannel,
                });
            }
            if (columns & (4 << (4 * iChannel))) {
                yAxes.push({
                    unit: getUnit(Unit.UNIT_WATT),
                    channelIndex: iChannel,
                });
            }
        }
    }
    function readFields() {
        let offset = 16;
        while (offset < dataOffset) {
            const fieldLength = readUInt16(offset);
            if (fieldLength == 0) {
                break;
            }
            offset += 2;
            const fieldId = readUInt8(offset);
            offset++;
            let fieldDataLength = fieldLength - 2 - 1;
            if (fieldId === Fields.FIELD_ID_COMMENT) {
                comment = readString(offset, offset + fieldDataLength);
                offset += fieldDataLength;
            }
            else if (fieldId === Fields.FIELD_ID_X_UNIT) {
                xAxis.unit = getUnit(readUInt8(offset));
                offset++;
            }
            else if (fieldId === Fields.FIELD_ID_X_STEP) {
                xAxis.step = readFloat(offset);
                offset += 4;
            }
            else if (fieldId === Fields.FIELD_ID_X_SCALE) {
                xAxis.scale = readUInt8(offset);
                offset++;
            }
            else if (fieldId === Fields.FIELD_ID_X_RANGE_MIN) {
                xAxis.range.min = readFloat(offset);
                offset += 4;
            }
            else if (fieldId === Fields.FIELD_ID_X_RANGE_MAX) {
                xAxis.range.max = readFloat(offset);
                offset += 4;
            }
            else if (fieldId === Fields.FIELD_ID_X_LABEL) {
                xAxis.label = readString(offset, offset + fieldDataLength);
                offset += fieldDataLength;
            }
            else if (fieldId >= Fields.FIELD_ID_Y_UNIT && fieldId <= Fields.FIELD_ID_Y_CHANNEL_INDEX) {
                let yAxisIndex = readUInt8(offset);
                offset++;
                yAxisIndex--;
                while (yAxisIndex >= yAxes.length) {
                    yAxes.push({
                        unit: yAxis.unit,
                        range: yAxis.range
                            ? {
                                min: yAxis.range.min,
                                max: yAxis.range.max,
                            }
                            : undefined,
                        label: yAxis.label,
                        channelIndex: yAxis.channelIndex,
                    });
                }
                fieldDataLength -= 1;
                let destYAxis;
                if (yAxisIndex >= 0) {
                    destYAxis = yAxes[yAxisIndex];
                }
                else {
                    yAxisDefined = true;
                    destYAxis = yAxis;
                }
                if (fieldId === Fields.FIELD_ID_Y_UNIT) {
                    destYAxis.unit = getUnit(readUInt8(offset));
                    offset++;
                }
                else if (fieldId === Fields.FIELD_ID_Y_RANGE_MIN) {
                    destYAxis.range.min = readFloat(offset);
                    offset += 4;
                }
                else if (fieldId === Fields.FIELD_ID_Y_RANGE_MAX) {
                    destYAxis.range.max = readFloat(offset);
                    offset += 4;
                }
                else if (fieldId === Fields.FIELD_ID_Y_LABEL) {
                    destYAxis.label = readString(offset, offset + fieldDataLength);
                    offset += fieldDataLength;
                }
                else if (fieldId === Fields.FIELD_ID_Y_CHANNEL_INDEX) {
                    destYAxis.channelIndex = readUInt8(offset) - 1;
                    offset++;
                }
                else {
                    // unknown field, skip
                    offset += fieldDataLength;
                }
            }
            else if (fieldId === Fields.FIELD_ID_Y_SCALE) {
                yAxisScale = readUInt8(offset);
                offset++;
            }
            else if (fieldId === Fields.FIELD_ID_CHANNEL_MODULE_TYPE) {
                readUInt8(offset); // channel index
                offset++;
                readUInt16(offset); // module type
                offset += 2;
            }
            else if (fieldId == Fields.FIELD_ID_CHANNEL_MODULE_REVISION) {
                readUInt8(offset); // channel index
                offset++;
                readUInt16(offset); // module revision
                offset += 2;
            }
            else {
                // unknown field, skip
                offset += fieldDataLength;
            }
        }
    }
    if (readUInt32(0) !== DLOG_MAGIC1) {
        return undefined;
    }
    if (readUInt32(4) !== DLOG_MAGIC2) {
        return undefined;
    }
    const version = readUInt16(8);
    if (version !== DLOG_VERSION1 && version !== DLOG_VERSION2) {
        return undefined;
    }
    let dataOffset = version == 1 ? 28 : readUInt32(12);
    let comment = undefined;
    let xAxis = {
        unit: getUnit(Unit.UNIT_SECOND),
        step: 1,
        range: {
            min: 0,
            max: 1,
        },
        label: "",
        scale: Scale.LINEAR,
    };
    let yAxisDefined = false;
    let yAxis = {
        unit: getUnit(Unit.UNIT_UNKNOWN),
        range: {
            min: 0,
            max: 1,
        },
        label: "",
        channelIndex: -1,
    };
    let yAxisScale = Scale.LINEAR;
    let yAxes = [];
    let startTime = undefined;
    let hasJitterColumn = false;
    if (version == 1) {
        xAxis.step = readFloat(16);
        readColumns();
        startTime = new Date(readUInt32(24) * 1000);
        hasJitterColumn = version === 1 ? !!(readUInt16(10) & 0x0001) : false;
    }
    else {
        readFields();
        startTime = undefined;
        hasJitterColumn = false;
    }
    let length = (data.length - dataOffset) / (((hasJitterColumn ? 1 : 0) + yAxes.length) * 4);
    if (!yAxisDefined) {
        yAxis = yAxes[0];
    }
    return {
        version,
        comment,
        xAxis,
        yAxis,
        yAxisScale,
        yAxes,
        dataOffset,
        length,
        startTime,
        hasJitterColumn,
    };
}
exports.decodeDlog = decodeDlog;
