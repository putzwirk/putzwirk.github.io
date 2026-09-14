export default function ConfirmDialog({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  return <div className="confirm-dialog-backdrop" onClick={onCancel}><div className="confirm-dialog" onClick={(event) => event.stopPropagation()}><h2>{title}</h2><p>{message}</p><div className="form-actions"><button className="btn" type="button" onClick={onCancel}>Cancel</button><button className="btn btn-danger" type="button" onClick={onConfirm}>Confirm</button></div></div></div>;
}
