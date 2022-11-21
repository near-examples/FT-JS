import { NearBindgen, call, view, initialize, near, LookupMap, assert } from "near-sdk-js";

@NEARBindgen({ initRequired: true })
export class AnotherConcern {
    @view({})
    viewMethod() {
        return "view";
    }
}