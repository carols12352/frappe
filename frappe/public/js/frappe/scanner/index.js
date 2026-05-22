import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

frappe.provide("frappe.ui");

frappe.ui.Scanner = class Scanner {
	constructor(options) {
		this.dialog = null;
		this.handler = null;
		this.controls = null;
		this.video = null;
		this.options = options;
		this.scan_count = 0;
		this.is_alive = false;
		this.stop_requested = false;

		if (!("multiple" in this.options)) {
			this.options.multiple = false;
		}
		if (options.container) {
			this.$scan_area = $(options.container);
			this.scan_area_id = frappe.dom.set_unique_id(this.$scan_area);
		}
		if (options.dialog) {
			this.dialog = this.make_dialog();
			this.dialog.show();
		}
	}

	scan() {
		this.start_scan();
	}

	start_scan() {
		this.stop_requested = false;
		if (!this.handler) {
			this.handler = new BrowserMultiFormatReader(this.get_hints());
		}
		if (!this.video) {
			this.video = document.createElement("video");
			this.video.setAttribute("playsinline", true);
			this.video.muted = true;
			this.$scan_area.empty().append(this.video);
		}

		this.handler
			.decodeFromConstraints(
				{
					video: {
						facingMode: { ideal: "environment" },
						width: { ideal: 1280 },
						height: { ideal: 720 },
					},
				},
				this.video,
				(result, error) => {
					if (!result) {
						if (error && !["NotFoundException", "ChecksumException"].includes(error.name)) {
							console.error(error);
						}
						this.log_scan_attempt(error);
						return;
					}

					const decodedResult = this.get_decoded_result(result);
					this.log_scan_result(decodedResult);
					if (this.options.on_scan) {
						try {
							this.options.on_scan(decodedResult);
						} catch (error) {
							console.error(error);
						}
					}
					if (!this.options.multiple) {
						this.stop_scan();
						this.hide_dialog();
					}
				}
			)
			.then((controls) => {
				this.controls = controls;
				if (this.stop_requested) {
					this.stop_scan();
					return;
				}
				this.is_alive = true;
			})
			.catch((err) => {
				this.is_alive = false;
				this.hide_dialog();
				console.error(err);
			});
	}

	stop_scan() {
		this.stop_requested = true;
		if (this.controls) {
			this.controls.stop();
			this.controls = null;
			this.is_alive = false;
			this.$scan_area.empty();
			this.video = null;
			this.hide_dialog();
		}
	}

	get_hints() {
		const formats = this.options.formats || [BarcodeFormat.CODE_128];
		const hints = new Map();

		hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
		hints.set(DecodeHintType.TRY_HARDER, true);
		hints.set(DecodeHintType.ASSUME_GS1, true);

		return hints;
	}

	log_scan_attempt(error) {
		if (!this.options.debug) {
			return;
		}
		this.scan_count++;
		if (this.scan_count % 20 === 0) {
			console.debug("Scanner running", {
				attempts: this.scan_count,
				last_error: error?.name,
				video_width: this.video?.videoWidth,
				video_height: this.video?.videoHeight,
			});
		}
	}

	log_scan_result(decodedResult) {
		if (this.options.debug) {
			console.debug("Scanner decoded", decodedResult);
		}
	}

	get_decoded_result(result) {
		const text = result.getText();
		const format = result.getBarcodeFormat();

		return {
			text,
			format,
			result: {
				text,
				format,
			},
			raw: result,
		};
	}

	make_dialog() {
		let dialog = new frappe.ui.Dialog({
			title: __("Scan QRCode"),
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "scan_area",
				},
			],
			on_page_show: () => {
				this.$scan_area = dialog.get_field("scan_area").$wrapper;
				this.$scan_area.addClass("barcode-scanner");
				this.scan_area_id = frappe.dom.set_unique_id(this.$scan_area);
				this.scan();
			},
			on_hide: () => {
				this.stop_scan();
			},
			minimizable: this.options.minimizable,
			primary_action_label: this.options.primary_action_label,
			primary_action: this.options.primary_action,
		});
		return dialog;
	}

	hide_dialog() {
		this.dialog && this.dialog.hide();
	}

	load_lib() {
		return Promise.resolve();
	}
};
