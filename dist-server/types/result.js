"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ok = Ok;
exports.Err = Err;
function Ok(data) {
    return { success: true, data };
}
function Err(error) {
    return { success: false, error };
}
//# sourceMappingURL=result.js.map